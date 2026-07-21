import express from "express";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SignJWT, importJWK, importPKCS8 } from "jose";

const PORT = parseInt(process.env.PORT ?? "3500");
const EVENT_BUS_URL = process.env.EVENT_BUS_URL ?? "http://localhost:4000";
const OKTA_DOMAIN = process.env.OKTA_DOMAIN ?? "";
const OKTA_AI_AGENT_ID = process.env.OKTA_AI_AGENT_ID ?? "";
const OKTA_PRIVATE_KEY = process.env.OKTA_PRIVATE_KEY ?? "";
const INVENTORY_API_URL = process.env.INVENTORY_API_URL ?? "http://inventory-server:3103";
const INVENTORY_AUTHZ_SERVER_ID = process.env.INVENTORY_AUTHZ_SERVER_ID ?? "default";
const INVENTORY_RESOURCE_AUDIENCE = process.env.INVENTORY_RESOURCE_AUDIENCE ?? "api://inventory-resource";
const CIBA_AUTHZ_SERVER_ID = process.env.CIBA_AUTHZ_SERVER_ID ?? INVENTORY_AUTHZ_SERVER_ID;
const CIBA_AUTHENTICATOR_ID = process.env.CIBA_AUTHENTICATOR_ID ?? "";
const PATTERN_ID = "p5";

// Tools that require CIBA approval before execution
const WRITE_TOOLS = new Set(["update_stock"]);

class CibaDeniedError extends Error {
  constructor() { super("CIBA denied by user"); }
}

async function emitEvent(actor: string, action: string, target: string, detail?: string, tokenSnippet?: string, level = "auth", token?: string) {
  try {
    await fetch(`${EVENT_BUS_URL}/emit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patternId: PATTERN_ID, actor, action, target, detail, tokenSnippet, level, token }),
    });
  } catch {
    // Non-fatal
  }
}

async function buildAgentJwt(audience: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  let privateKey: Parameters<SignJWT["sign"]>[0];
  let kid: string | undefined;
  try {
    const jwk = JSON.parse(OKTA_PRIVATE_KEY);
    kid = jwk.kid as string | undefined;
    privateKey = await importJWK(jwk, "RS256") as typeof privateKey;
  } catch {
    privateKey = await importPKCS8(OKTA_PRIVATE_KEY, "RS256") as typeof privateKey;
  }
  return new SignJWT({})
    .setProtectedHeader({ alg: "RS256", ...(kid ? { kid } : {}) })
    .setIssuer(OKTA_AI_AGENT_ID)
    .setSubject(OKTA_AI_AGENT_ID)
    .setAudience(audience)
    .setIssuedAt(now)
    .setExpirationTime(now + 300)
    .setJti(crypto.randomUUID())
    .sign(privateKey);
}

// XAA Step 1: user id_token → ID-JAG at Okta org server
async function getIdJag(userIdToken: string, authzServerId: string, scopes: string[]): Promise<string> {
  const orgTokenUrl = `https://${OKTA_DOMAIN}/oauth2/v1/token`;
  const authzUrl = `https://${OKTA_DOMAIN}/oauth2/${authzServerId}`;
  const scope = scopes.join(" ");

  await emitEvent("P5 Agent", "ID-JAG exchange", "Okta Org Server", `aud=${authzUrl} scope=${scope}`, undefined, "auth");

  const clientAssertion = await buildAgentJwt(orgTokenUrl);
  const resp = await fetch(orgTokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
      requested_token_type: "urn:ietf:params:oauth:token-type:id-jag",
      subject_token: userIdToken,
      subject_token_type: "urn:ietf:params:oauth:token-type:id_token",
      audience: authzUrl,
      scope,
      client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
      client_assertion: clientAssertion,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`ID-JAG exchange failed: ${resp.status} ${text}`);
  }

  const { access_token: idJag } = await resp.json() as { access_token: string };
  const snippet = idJag.slice(0, 12) + "..." + idJag.slice(-8);
  await emitEvent("P5 Agent", "obtained ID-JAG", "Okta", "user+agent identity", snippet, "token", idJag);
  return idJag;
}

// XAA Step 2: ID-JAG → resource token at inventory auth server (no scope param)
async function getStep2Token(idJag: string): Promise<string> {
  const authzTokenUrl = `https://${OKTA_DOMAIN}/oauth2/${INVENTORY_AUTHZ_SERVER_ID}/v1/token`;

  await emitEvent("P5 Agent", "resource token exchange", "Okta Inventory AS", `aud=${INVENTORY_RESOURCE_AUDIENCE}`, undefined, "auth");

  const clientAssertion = await buildAgentJwt(authzTokenUrl);
  const resp = await fetch(authzTokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: idJag,
      client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
      client_assertion: clientAssertion,
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Resource token exchange failed: ${resp.status} ${text}`);
  }

  const { access_token: resourceToken } = await resp.json() as { access_token: string };
  const snippet = resourceToken.slice(0, 12) + "..." + resourceToken.slice(-8);
  await emitEvent("P5 Agent", "obtained read token", "Okta", `aud=${INVENTORY_RESOURCE_AUDIENCE} scope=inventory:read`, snippet, "token", resourceToken);
  return resourceToken;
}

// CIBA Step 1: initiate backchannel auth request; returns auth_req_id + poll interval
async function initiateCiba(loginHint: string, bindingMessage: string): Promise<{ auth_req_id: string; interval: number }> {
  const bcUrl = `https://${OKTA_DOMAIN}/oauth2/${CIBA_AUTHZ_SERVER_ID}/v1/bc/authorize`;
  const clientAssertion = await buildAgentJwt(bcUrl);

  await emitEvent("P5 Agent", "CIBA bc/authorize", "Okta CIBA AS", `login_hint=${loginHint} scope=inventory:write`, undefined, "auth");

  const params = new URLSearchParams({
    client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
    client_assertion: clientAssertion,
    login_hint: loginHint,
    scope: "inventory:write",
    binding_message: bindingMessage,
  });
  if (CIBA_AUTHENTICATOR_ID) {
    params.set("backchannel_custom_authenticator_id", CIBA_AUTHENTICATOR_ID);
  }

  const resp = await fetch(bcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`CIBA bc/authorize failed: ${resp.status} ${text}`);
  }

  const data = await resp.json() as { auth_req_id: string; expires_in: number; interval?: number };
  return { auth_req_id: data.auth_req_id, interval: data.interval ?? 3 };
}

// CIBA Step 2 (one poll): returns access_token on approval, "pending" on wait, throws CibaDeniedError on deny
async function pollCibaToken(auth_req_id: string): Promise<"pending" | string> {
  const tokenUrl = `https://${OKTA_DOMAIN}/oauth2/${CIBA_AUTHZ_SERVER_ID}/v1/token`;
  const clientAssertion = await buildAgentJwt(tokenUrl);

  const resp = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:openid:params:grant-type:ciba",
      auth_req_id,
      client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
      client_assertion: clientAssertion,
    }),
  });

  if (resp.ok) {
    const { access_token } = await resp.json() as { access_token: string };
    return access_token;
  }

  const { error } = await resp.json() as { error: string };
  if (error === "access_denied") throw new CibaDeniedError();
  return "pending"; // authorization_pending or slow_down
}

// Full CIBA flow: initiate → poll until approved/denied/timeout
async function runCibaApproval(loginHint: string, bindingMessage: string): Promise<string> {
  const { auth_req_id, interval } = await initiateCiba(loginHint, bindingMessage);

  const maxAttempts = Math.ceil(120 / interval);
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, interval * 1000));
    const result = await pollCibaToken(auth_req_id);
    if (result !== "pending") {
      const snippet = result.slice(0, 12) + "..." + result.slice(-8);
      await emitEvent("P5 Agent", "CIBA token obtained", "Okta CIBA AS", "scope=inventory:write", snippet, "token", result);
      return result;
    }
  }

  throw new Error("CIBA approval timed out after 120s");
}

// Human-readable description of a write tool call for the binding_message
function describeAction(name: string, args: Record<string, unknown>): string {
  if (name === "update_stock") {
    const sku = args.sku as string;
    const qty = args.quantity_to_add as number;
    const reason = args.reason as string | undefined;
    return `Add ${qty} units to inventory for SKU ${sku}${reason ? ` (${reason})` : ""}`;
  }
  return `Execute ${name}`;
}

interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

async function discoverInventoryTools(): Promise<ToolDef[]> {
  const resp = await fetch(`${INVENTORY_API_URL}/tools`);
  if (!resp.ok) throw new Error(`Tool discovery failed: ${resp.status}`);
  const { tools } = await resp.json() as { tools: Array<{ name: string; description: string; inputSchema?: Record<string, unknown> }> };
  await emitEvent("P5 Agent", "discovered tools", "Inventory Server", `count=${tools.length}`, undefined, "info");
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema ?? { type: "object", properties: {} },
  }));
}

// One-shot MCP tool call with an explicit Bearer token
async function callInventoryTool(name: string, args: Record<string, unknown>, token: string | null): Promise<string> {
  await emitEvent("P5 Agent", "calling tool", "Inventory Server", `tool=${name}`, undefined, "info");

  const headers: Record<string, string> = { "X-Pattern-Id": PATTERN_ID };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const transport = new StreamableHTTPClientTransport(
    new URL(`${INVENTORY_API_URL}/mcp`),
    { requestInit: { headers } }
  );
  const client = new Client({ name: "p5-agent", version: "1.0.0" });
  await client.connect(transport);
  try {
    const result = await client.callTool({ name, arguments: args });
    const content = result.content as { type: string; text: string }[];
    return content.filter((c) => c.type === "text").map((c) => c.text).join("\n");
  } finally {
    await client.close().catch(() => {});
  }
}

interface Message {
  role: "user" | "assistant";
  content: string;
}

const sessions = new Map<string, Message[]>();
const seenTokenSessions = new Set<string>();

function decodeJwtPayload(token: string): Record<string, unknown> {
  try {
    const b64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
  } catch {
    return {};
  }
}

interface RequestContext {
  userIdToken: string;
  userEmail: string;
  readToken: string | null; // populated at request start via XAA
}

interface LLMOverrides { anthropicKey?: string; openaiKey?: string; }

async function* runAgentLoop(
  userMessage: string,
  history: Message[],
  tools: ToolDef[],
  ctx: RequestContext,
  overrides?: LLMOverrides
): AsyncGenerator<string> {
  const messages: Message[] = [...history, { role: "user", content: userMessage }];
  const isFirstMessage = history.length === 0;
  const greetInstruction = isFirstMessage ? `Start your response by greeting ${ctx.userEmail} by name. ` : "";
  const system = `${greetInstruction}You are a helpful inventory assistant acting on behalf of ${ctx.userEmail}. Use the available tools to answer questions about products, stock levels, and orders. For stock updates, explain what you're doing before calling the tool. Be concise and format responses as readable markdown. When presenting product or inventory data, use tables.`;

  if (overrides?.anthropicKey || process.env.ANTHROPIC_API_KEY) {
    yield* runAnthropic(messages, system, tools, ctx, overrides);
  } else if (overrides?.openaiKey || process.env.OPENAI_API_KEY) {
    yield* runOpenAI(messages, system, tools, ctx, overrides);
  } else {
    yield "No LLM API key configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.";
  }
}

async function* runAnthropic(
  messages: Message[],
  system: string,
  tools: ToolDef[],
  ctx: RequestContext,
  overrides?: LLMOverrides
): AsyncGenerator<string> {
  const anthropic = new Anthropic({ ...(overrides?.anthropicKey && { apiKey: overrides.anthropicKey }) });
  const anthropicTools: Anthropic.Tool[] = tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema as Anthropic.Tool["input_schema"],
  }));

  let msgs: Anthropic.MessageParam[] = messages.map((m) => ({ role: m.role, content: m.content }));

  while (true) {
    const response = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL ?? "claude-opus-4-7",
      max_tokens: 4096,
      system,
      messages: msgs,
      tools: anthropicTools,
    });

    const textBlocks = response.content.filter((b): b is Anthropic.TextBlock => b.type === "text");
    const toolBlocks = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");

    if (textBlocks.length > 0) yield textBlocks.map((b) => b.text).join("");
    if (response.stop_reason !== "tool_use" || toolBlocks.length === 0) break;

    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const tool of toolBlocks) {
      const args = tool.input as Record<string, unknown>;

      if (WRITE_TOOLS.has(tool.name)) {
        const actionDesc = describeAction(tool.name, args);

        yield `\n\n🔒 **Approval required**\n\nI need to: **${actionDesc}**\n\nA push notification has been sent to your Okta authenticator app. Please approve or deny to continue...\n`;
        await emitEvent("P5 Agent", "CIBA initiated", "Okta CIBA AS", `tool=${tool.name}`, undefined, "auth");

        try {
          const cibaToken = await runCibaApproval(ctx.userEmail, actionDesc);
          await emitEvent("P5 Agent", "CIBA approved", "Android app", `tool=${tool.name}`, undefined, "auth");
          yield `\n✅ **Approved.** Executing...\n\n`;
          const result = await callInventoryTool(tool.name, args, cibaToken);
          toolResults.push({ type: "tool_result", tool_use_id: tool.id, content: result });
        } catch (err) {
          if (err instanceof CibaDeniedError) {
            await emitEvent("P5 Agent", "CIBA denied", "Android app", `tool=${tool.name}`, undefined, "error");
            yield `\n❌ **Denied.** The request was rejected on your device.\n\n`;
            toolResults.push({ type: "tool_result", tool_use_id: tool.id, content: "User denied the approval request on their authenticator device. Do not retry this action." });
          } else {
            const msg = err instanceof Error ? err.message : "CIBA error";
            await emitEvent("P5 Agent", "CIBA error", "Okta CIBA AS", msg, undefined, "error");
            yield `\n⚠️ **Approval error:** ${msg}\n\n`;
            toolResults.push({ type: "tool_result", tool_use_id: tool.id, content: `Approval process failed: ${msg}` });
          }
        }
      } else {
        // Read tool — use XAA read token
        const token = ctx.readToken;
        const result = await callInventoryTool(tool.name, args, token);
        toolResults.push({ type: "tool_result", tool_use_id: tool.id, content: result });
      }
    }

    msgs = [
      ...msgs,
      { role: "assistant", content: response.content },
      { role: "user", content: toolResults },
    ];
  }
}

async function* runOpenAI(
  messages: Message[],
  system: string,
  tools: ToolDef[],
  ctx: RequestContext,
  overrides?: LLMOverrides
): AsyncGenerator<string> {
  const openai = new OpenAI({ ...(overrides?.openaiKey && { apiKey: overrides.openaiKey }) });
  const openaiTools: OpenAI.ChatCompletionTool[] = tools.map((t) => ({
    type: "function" as const,
    function: { name: t.name, description: t.description, parameters: t.inputSchema },
  }));

  let msgs: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: system },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  while (true) {
    const response = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL ?? "gpt-4o",
      messages: msgs,
      tools: openaiTools,
    });

    const choice = response.choices[0];
    if (choice.message.content) yield choice.message.content;
    if (choice.finish_reason !== "tool_calls" || !choice.message.tool_calls?.length) break;

    const toolResults: OpenAI.ChatCompletionToolMessageParam[] = [];

    for (const tc of choice.message.tool_calls) {
      const args = JSON.parse(tc.function.arguments) as Record<string, unknown>;

      if (WRITE_TOOLS.has(tc.function.name)) {
        const actionDesc = describeAction(tc.function.name, args);

        yield `\n\n🔒 **Approval required**\n\nI need to: **${actionDesc}**\n\nA push notification has been sent to your Okta authenticator app. Please approve or deny to continue...\n`;
        await emitEvent("P5 Agent", "CIBA initiated", "Okta CIBA AS", `tool=${tc.function.name}`, undefined, "auth");

        try {
          const cibaToken = await runCibaApproval(ctx.userEmail, actionDesc);
          await emitEvent("P5 Agent", "CIBA approved", "Android app", `tool=${tc.function.name}`, undefined, "auth");
          yield `\n✅ **Approved.** Executing...\n\n`;
          const result = await callInventoryTool(tc.function.name, args, cibaToken);
          toolResults.push({ role: "tool", tool_call_id: tc.id, content: result });
        } catch (err) {
          if (err instanceof CibaDeniedError) {
            await emitEvent("P5 Agent", "CIBA denied", "Android app", `tool=${tc.function.name}`, undefined, "error");
            yield `\n❌ **Denied.** The request was rejected on your device.\n\n`;
            toolResults.push({ role: "tool", tool_call_id: tc.id, content: "User denied the approval request on their authenticator device. Do not retry this action." });
          } else {
            const msg = err instanceof Error ? err.message : "CIBA error";
            await emitEvent("P5 Agent", "CIBA error", "Okta CIBA AS", msg, undefined, "error");
            yield `\n⚠️ **Approval error:** ${msg}\n\n`;
            toolResults.push({ role: "tool", tool_call_id: tc.id, content: `Approval process failed: ${msg}` });
          }
        }
      } else {
        const result = await callInventoryTool(tc.function.name, args, ctx.readToken);
        toolResults.push({ role: "tool", tool_call_id: tc.id, content: result });
      }
    }

    msgs = [...msgs, choice.message, ...toolResults];
  }
}

// ── Express server ────────────────────────────────────────────────────────────

const app = express();
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-LLM-Api-Key, X-LLM-Provider");
  if (req.method === "OPTIONS") { res.sendStatus(200); return; }
  next();
});
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "p5-agent" });
});

app.post("/chat", async (req, res) => {
  const { message, session_id } = req.body as { message: string; session_id?: string };

  if (!message) {
    res.status(400).json({ error: "message required" });
    return;
  }

  const llmOverrides: LLMOverrides = {
    anthropicKey: req.headers["x-llm-api-key"] && req.headers["x-llm-provider"] !== "openai"
      ? String(req.headers["x-llm-api-key"]) : undefined,
    openaiKey: req.headers["x-llm-api-key"] && req.headers["x-llm-provider"] === "openai"
      ? String(req.headers["x-llm-api-key"]) : undefined,
  };

  const authHeader = req.headers.authorization;
  const userIdToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!userIdToken) {
    await emitEvent("P5 Agent", "rejected request", "chat", "missing user ID token", undefined, "error");
    res.status(401).json({ error: "User ID token required — log in first" });
    return;
  }

  const sid = session_id ?? "default";
  const history = sessions.get(sid) ?? [];
  const claims = decodeJwtPayload(userIdToken);
  const userEmail = (claims.email ?? claims.sub ?? "user") as string;

  if (!seenTokenSessions.has(sid)) {
    seenTokenSessions.add(sid);
    await emitEvent("P5 Agent", "user id_token received", "Okta", `user=${userEmail}`, undefined, "token", userIdToken);
  }

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Transfer-Encoding", "chunked");

  try {
    // Discover tools
    let tools: ToolDef[];
    try {
      tools = await discoverInventoryTools();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Tool discovery failed";
      await emitEvent("P5 Agent", "initialization failed", "agent", msg, undefined, "error");
      res.write(`Error: ${msg}`);
      res.end();
      return;
    }

    // Pre-fetch XAA read token — if this fails, read tools will return a permission error inline
    let readToken: string | null = null;
    try {
      const idJag = await getIdJag(userIdToken, INVENTORY_AUTHZ_SERVER_ID, ["inventory:read"]);
      readToken = await getStep2Token(idJag);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "XAA failed";
      await emitEvent("P5 Agent", "XAA failed", "Okta", msg, undefined, "error");
    }

    const ctx: RequestContext = { userIdToken, userEmail, readToken };

    let fullResponse = "";
    for await (const chunk of runAgentLoop(message, history, tools, ctx, llmOverrides)) {
      fullResponse += chunk;
      res.write(chunk);
    }

    const newHistory: Message[] = [
      ...history,
      { role: "user", content: message },
      { role: "assistant", content: fullResponse },
    ];
    sessions.set(sid, newHistory.slice(-20));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[chat error]", msg);
    res.write("I encountered an unexpected error. Please try again.");
  }

  res.end();
});

app.listen(PORT, () => {
  console.log(`P5 agent listening on :${PORT}`);
  emitEvent("P5 Agent", "started", "event-bus", `port=${PORT}`, undefined, "info");
});
