import express, { Request, Response } from "express";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SignJWT, importJWK, importPKCS8 } from "jose";
import { OpenFgaClient, CredentialsMethod } from "@openfga/sdk";

const PORT = parseInt(process.env.PORT ?? "3700");
const EVENT_BUS_URL = process.env.EVENT_BUS_URL ?? "http://localhost:4000";
const OKTA_DOMAIN = process.env.OKTA_DOMAIN ?? "";
const OKTA_AI_AGENT_ID = process.env.OKTA_AI_AGENT_ID ?? "";
const OKTA_PRIVATE_KEY = process.env.OKTA_PRIVATE_KEY ?? "";
const HR_API_URL = process.env.HR_API_URL ?? "http://hr-server:3101";
const FINANCE_API_URL = process.env.FINANCE_API_URL ?? "http://finance-server:3102";
const HR_RESOURCE_AUDIENCE = process.env.HR_RESOURCE_AUDIENCE ?? "";
const FINANCE_RESOURCE_AUDIENCE = process.env.FINANCE_RESOURCE_AUDIENCE ?? "";
const HR_AUTHZ_SERVER_ID = process.env.HR_AUTHZ_SERVER_ID ?? "";
const FINANCE_AUTHZ_SERVER_ID = process.env.FINANCE_AUTHZ_SERVER_ID ?? "";
const OKTA_FGA_STORE_ID = process.env.OKTA_FGA_STORE_ID ?? "";
const OKTA_FGA_API_URL = (process.env.OKTA_FGA_API_URL ?? "https://api.us1.fga.dev").replace(/\/$/, "");
const OKTA_FGA_CLIENT_ID = process.env.OKTA_FGA_CLIENT_ID ?? "";
const OKTA_FGA_CLIENT_SECRET = process.env.OKTA_FGA_CLIENT_SECRET ?? "";
const OKTA_FGA_AUTHORIZATION_MODEL_ID = process.env.OKTA_FGA_AUTHORIZATION_MODEL_ID ?? "";
const PATTERN_ID = "p7";

// ── Static server config ────────────────────────────────────────────────────

const AUDIENCE_SCOPES: Record<string, string[]> = {
  "api:hr":      ["hr:read", "hr:write", "hr:delete"],
  "api:finance": ["finance:read", "finance:write", "finance:approve"],
};

// Resolve audience-specific scopes from env, falling back to canonical defaults
function resolveScopes(audience: string): string[] {
  return AUDIENCE_SCOPES[audience] ?? (audience.includes("hr") ? ["hr:read", "hr:write"] : ["finance:read", "finance:write"]);
}

interface DiscoveredServer {
  label: string;
  url: string;
  audience: string;
  issuerUrl: string;
  scopes: string[];
}

function buildStaticServers(): DiscoveredServer[] {
  const servers: DiscoveredServer[] = [];
  if (HR_API_URL && HR_RESOURCE_AUDIENCE && HR_AUTHZ_SERVER_ID) {
    servers.push({
      label: "HR",
      url: HR_API_URL,
      audience: HR_RESOURCE_AUDIENCE,
      issuerUrl: `https://${OKTA_DOMAIN}/oauth2/${HR_AUTHZ_SERVER_ID}`,
      scopes: resolveScopes(HR_RESOURCE_AUDIENCE),
    });
  }
  if (FINANCE_API_URL && FINANCE_RESOURCE_AUDIENCE && FINANCE_AUTHZ_SERVER_ID) {
    servers.push({
      label: "Finance",
      url: FINANCE_API_URL,
      audience: FINANCE_RESOURCE_AUDIENCE,
      issuerUrl: `https://${OKTA_DOMAIN}/oauth2/${FINANCE_AUTHZ_SERVER_ID}`,
      scopes: resolveScopes(FINANCE_RESOURCE_AUDIENCE),
    });
  }
  return servers;
}

const STATIC_SERVERS: DiscoveredServer[] = buildStaticServers();

// ── OpenFGA client ──────────────────────────────────────────────────────────

const fgaClient = new OpenFgaClient({
  apiUrl: OKTA_FGA_API_URL,
  storeId: OKTA_FGA_STORE_ID,
  authorizationModelId: OKTA_FGA_AUTHORIZATION_MODEL_ID || undefined,
  credentials: {
    method: CredentialsMethod.ClientCredentials,
    config: {
      clientId: OKTA_FGA_CLIENT_ID,
      clientSecret: OKTA_FGA_CLIENT_SECRET,
      apiTokenIssuer: "auth.fga.dev",
      apiAudience: "https://api.us1.fga.dev/",
    },
  },
});

async function checkFgaDelegation(userEmail: string, toolName: string): Promise<boolean> {
  try {
    const response = await fgaClient.check({
      user: `user:${userEmail}`,
      relation: "delegated",
      object: `tool:${toolName}`,
    });
    return response.allowed === true;
  } catch (err) {
    console.error(`[FGA] check error for ${toolName}:`, err);
    return false;
  }
}

// ── Tool scope logic ────────────────────────────────────────────────────────

const WRITE_PREFIXES = ["update_", "create_", "delete_", "post_", "write_", "set_", "add_", "remove_"];

function getScopesForTool(toolName: string, availableScopes: string[]): string[] {
  const isWrite = WRITE_PREFIXES.some((p) => toolName.startsWith(p));
  const preferred = isWrite
    ? availableScopes.filter((s) => s.endsWith(":write"))
    : availableScopes.filter((s) => s.endsWith(":read"));
  return preferred.length > 0 ? preferred : availableScopes;
}

// ── Event bus ───────────────────────────────────────────────────────────────

async function emitEvent(
  actor: string,
  action: string,
  target: string,
  detail?: string,
  token?: string,
  level: "info" | "auth" | "token" | "error" | "separator" = "info"
): Promise<void> {
  try {
    await fetch(`${EVENT_BUS_URL}/emit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ patternId: PATTERN_ID, actor, action, target, detail, token, level }),
    });
  } catch { /* ignore */ }
}

// ── XAA token exchange (identical to P3) ──────────────────────────────────

async function buildAgentJwt(audience: string): Promise<string> {
  const raw = OKTA_PRIVATE_KEY.trim();
  let privateKey: CryptoKey;
  let kid: string | undefined;
  try {
    const jwk = JSON.parse(raw);
    kid = jwk.kid;
    privateKey = await importJWK(jwk, "RS256") as CryptoKey;
  } catch {
    privateKey = await importPKCS8(raw, "RS256") as CryptoKey;
  }
  const now = Math.floor(Date.now() / 1000);
  const jwt = await new SignJWT({})
    .setProtectedHeader({ alg: "RS256", ...(kid ? { kid } : {}) })
    .setIssuer(OKTA_AI_AGENT_ID)
    .setSubject(OKTA_AI_AGENT_ID)
    .setAudience(audience)
    .setIssuedAt(now)
    .setExpirationTime(now + 300)
    .setJti(crypto.randomUUID())
    .sign(privateKey);
  return jwt;
}

async function getIdJag(
  userIdToken: string,
  issuerUrl: string,
  scopes: string[],
  label: string
): Promise<string> {
  const orgTokenUrl = `https://${OKTA_DOMAIN}/oauth2/v1/token`;
  const clientAssertion = await buildAgentJwt(orgTokenUrl);
  const scope = scopes.join(" ");

  const p = (s: string) => s.padEnd(24);
  const requestDetail =
    `POST ${orgTokenUrl}\n` +
    `  ${p("grant_type")} = urn:ietf:params:oauth:grant-type:token-exchange\n` +
    `  ${p("requested_token_type")} = urn:ietf:params:oauth:token-type:id-jag\n` +
    `  ${p("subject_token")} = ${userIdToken.slice(0, 16)}… (user id_token)\n` +
    `  ${p("subject_token_type")} = urn:ietf:params:oauth:token-type:id_token\n` +
    `  ${p("audience")} = ${issuerUrl}\n` +
    `  ${p("scope")} = ${scope}\n` +
    `  ${p("client_assertion")} = iss=sub=${OKTA_AI_AGENT_ID}`;

  console.log(`\n[P7 XAA Step 1 — ID-JAG Request]\n  ${requestDetail.replace(/\n/g, "\n  ")}`);
  await emitEvent("P7 Agent", "XAA Step 1 — ID-JAG request", "Okta Org Server", requestDetail, undefined, "auth");

  const resp = await fetch(orgTokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
      requested_token_type: "urn:ietf:params:oauth:token-type:id-jag",
      subject_token: userIdToken,
      subject_token_type: "urn:ietf:params:oauth:token-type:id_token",
      audience: issuerUrl,
      scope,
      client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
      client_assertion: clientAssertion,
    }),
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`[${label}] XAA step 1 failed (${resp.status}): ${err}`);
  }
  const data = await resp.json() as { access_token: string };
  const idJag = data.access_token;
  await emitEvent("P7 Agent", "obtained ID-JAG", "Okta", `${label} user+agent identity`, idJag, "token");
  return idJag;
}

async function getStep2Token(
  idJag: string,
  issuerUrl: string,
  audience: string,
  label: string
): Promise<string> {
  const tokenUrl = `${issuerUrl}/v1/token`;
  const clientAssertion = await buildAgentJwt(tokenUrl);

  const p2 = (s: string) => s.padEnd(24);
  const requestDetail2 =
    `POST ${tokenUrl}\n` +
    `  ${p2("grant_type")} = urn:ietf:params:oauth:grant-type:jwt-bearer\n` +
    `  ${p2("assertion")} = ${idJag.slice(0, 16)}… (ID-JAG from Step 1)\n` +
    `  ${p2("client_assertion")} = iss=sub=${OKTA_AI_AGENT_ID}\n` +
    `  [scope omitted — locked inside ID-JAG]`;

  console.log(`\n[P7 XAA Step 2 — Resource Token Request]\n  ${requestDetail2.replace(/\n/g, "\n  ")}`);
  await emitEvent("P7 Agent", "XAA Step 2 — resource token request", label, requestDetail2, undefined, "auth");

  const resp = await fetch(tokenUrl, {
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
    const err = await resp.text();
    throw new Error(`[${label}] XAA step 2 failed (${resp.status}): ${err}`);
  }
  const data = await resp.json() as { access_token: string };
  const token = data.access_token;
  await emitEvent("P7 Agent", "obtained resource token", "Okta", `${label} aud=${audience}`, token, "token");
  return token;
}

interface RequestContext {
  userIdToken: string;
  userEmail: string;
  tokenCache: Map<string, string>;
}

async function getTokenForServer(server: DiscoveredServer, scopes: string[], ctx: RequestContext): Promise<string> {
  const cacheKey = `${server.audience}:${scopes.sort().join(",")}`;
  if (ctx.tokenCache.has(cacheKey)) return ctx.tokenCache.get(cacheKey)!;

  const idJag = await getIdJag(ctx.userIdToken, server.issuerUrl, scopes, server.label);
  const token = await getStep2Token(idJag, server.issuerUrl, server.audience, server.label);

  ctx.tokenCache.set(cacheKey, token);
  return token;
}

// ── MCP tool discovery / invocation ────────────────────────────────────────

interface ToolDef {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  _server: DiscoveredServer;
}

async function discoverAllTools(_ctx: RequestContext): Promise<{ tools: ToolDef[]; toolMap: Map<string, DiscoveredServer> }> {
  const tools: ToolDef[] = [];
  const toolMap = new Map<string, DiscoveredServer>();

  for (const server of STATIC_SERVERS) {
    try {
      // Use the unauthenticated REST /tools endpoint for discovery (same as P3's discoverToolsViaRest)
      // This avoids needing an XAA token during startup/discovery
      const resp = await fetch(`${server.url}/tools`);
      if (!resp.ok) throw new Error(`Tool discovery failed for ${server.label}: ${resp.status}`);
      const { tools: discovered } = await resp.json() as { tools: Array<{ name: string; description: string; inputSchema?: Record<string, unknown> }> };

      for (const t of discovered) {
        tools.push({ name: t.name, description: t.description, inputSchema: t.inputSchema ?? { type: "object", properties: {} }, _server: server });
        toolMap.set(t.name, server);
      }
      await emitEvent("P7 Agent", "tools/list", server.label, `${discovered.length} tools discovered`, undefined, "info");
    } catch (err) {
      console.error(`[P7] Failed to discover tools for ${server.label}:`, err);
    }
  }
  return { tools, toolMap };
}

async function callMcpTool(
  name: string,
  args: Record<string, unknown>,
  ctx: RequestContext,
  toolMap: Map<string, DiscoveredServer>
): Promise<string> {
  // FGA check before any tool call
  await emitEvent(
    "P7 Agent", "FGA check",
    "Okta FGA",
    `{ user: "user:${ctx.userEmail}", relation: "delegated", object: "tool:${name}" }`,
    undefined, "auth"
  );
  const allowed = await checkFgaDelegation(ctx.userEmail, name);
  if (!allowed) {
    await emitEvent(
      "Okta FGA", "check result → denied",
      "P7 Agent",
      `{ allowed: false } — user:${ctx.userEmail} has not delegated tool:${name}`,
      undefined, "auth"
    );
    return `You haven't delegated '${name}' to me. Toggle it on in the delegation panel to allow this action.`;
  }
  await emitEvent(
    "Okta FGA", "check result → allowed",
    "P7 Agent",
    `{ allowed: true } — user:${ctx.userEmail} → delegated → tool:${name}`,
    undefined, "auth"
  );

  const server = toolMap.get(name);
  if (!server) throw new Error(`No server found for tool: ${name}`);

  const scopes = getScopesForTool(name, server.scopes);
  let token: string;
  try {
    token = await getTokenForServer(server, scopes, ctx);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[P7] XAA failed for ${name} (${server.label}):`, msg);
    await emitEvent(server.label, "XAA failed", "P7 Agent", msg, undefined, "error");
    return `Access to "${name}" was blocked by Okta policy. Error: ${msg}`;
  }

  const transport = new StreamableHTTPClientTransport(new URL(`${server.url}/mcp`), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });
  const client = new Client({ name: "p7-agent", version: "1.0.0" }, { capabilities: {} });
  await client.connect(transport);

  await emitEvent("P7 Agent", `tools/call ${name}`, server.label, JSON.stringify(args).slice(0, 120), undefined, "info");
  const result = await client.callTool({ name, arguments: args });
  await client.close();

  const content = result.content as Array<{ type: string; text?: string }>;
  return content.map((c) => c.text ?? "").join("\n");
}

// ── LLM client (same pattern as P3) ────────────────────────────────────────

const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null;
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

function buildSystemPrompt(userEmail: string): string {
  return `You are a helpful HR and Finance assistant for ${userEmail}.

You have access to HR tools (employee data, org chart, departments) and Finance tools (budgets, invoices, expenses, cost centers). There is exactly one organization — always call tools directly without asking which company or organization to use.

Call tools immediately when asked — never ask for clarification first. For example, if asked to list employees, call list_employees right away with no arguments. If asked about departments, call list_departments immediately. Let the tool results speak for themselves.

If you receive a denial message back from a tool (saying the action hasn't been delegated), relay it clearly to the user and tell them to toggle that permission on in the delegation panel on the left. Do NOT call the same denied tool again.

Be concise and professional.`;
}

// ── Agentic loop ────────────────────────────────────────────────────────────

async function runAgentLoop(
  userMessage: string,
  ctx: RequestContext,
  tools: ToolDef[],
  toolMap: Map<string, DiscoveredServer>,
  onToken: (text: string) => void
): Promise<void> {
  const messages: Anthropic.MessageParam[] | OpenAI.ChatCompletionMessageParam[] = [
    { role: "user", content: userMessage },
  ];

  const anthropicTools: Anthropic.Tool[] = tools.map((t) => ({
    name: t.name,
    description: t.description ?? "",
    input_schema: t.inputSchema as Anthropic.Tool["input_schema"],
  }));

  if (anthropic) {
    let continueLoop = true;
    while (continueLoop) {
      continueLoop = false;
      const stream = anthropic.messages.stream({
        model: "claude-opus-4-8",
        max_tokens: 4096,
        system: buildSystemPrompt(ctx.userEmail),
        messages: messages as Anthropic.MessageParam[],
        tools: anthropicTools,
      });

      let assistantText = "";
      const toolUseBlocks: Anthropic.ToolUseBlock[] = [];

      for await (const chunk of stream) {
        if (chunk.type === "content_block_delta" && chunk.delta.type === "text_delta") {
          onToken(chunk.delta.text);
          assistantText += chunk.delta.text;
        } else if (chunk.type === "content_block_start" && chunk.content_block.type === "tool_use") {
          toolUseBlocks.push(chunk.content_block as Anthropic.ToolUseBlock);
        } else if (chunk.type === "content_block_delta" && chunk.delta.type === "input_json_delta") {
          const last = toolUseBlocks[toolUseBlocks.length - 1];
          if (last) (last as { partial_json?: string }).partial_json = ((last as { partial_json?: string }).partial_json ?? "") + chunk.delta.partial_json;
        }
      }

      const finalMsg = await stream.finalMessage();

      if (finalMsg.stop_reason === "tool_use") {
        continueLoop = true;
        (messages as Anthropic.MessageParam[]).push({ role: "assistant", content: finalMsg.content });
        const toolResults: Anthropic.ToolResultBlockParam[] = [];
        for (const block of finalMsg.content) {
          if (block.type !== "tool_use") continue;
          const result = await callMcpTool(block.name, block.input as Record<string, unknown>, ctx, toolMap);
          toolResults.push({ type: "tool_result", tool_use_id: block.id, content: result });
        }
        (messages as Anthropic.MessageParam[]).push({ role: "user", content: toolResults });
      }
    }
  } else if (openai) {
    const openaiTools: OpenAI.ChatCompletionTool[] = tools.map((t) => ({
      type: "function" as const,
      function: { name: t.name, description: t.description ?? "", parameters: t.inputSchema },
    }));
    let continueLoop = true;
    while (continueLoop) {
      continueLoop = false;
      const stream = await openai.chat.completions.create({
        model: "gpt-4o",
        stream: true,
        messages: messages as OpenAI.ChatCompletionMessageParam[],
        tools: openaiTools,
      });

      let assistantText = "";
      const toolCalls: OpenAI.ChatCompletionMessageToolCall[] = [];
      let finishReason: string | null = null;

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        if (delta?.content) { onToken(delta.content); assistantText += delta.content; }
        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            if (tc.index !== undefined) {
              if (!toolCalls[tc.index]) toolCalls[tc.index] = { id: tc.id ?? "", type: "function", function: { name: tc.function?.name ?? "", arguments: "" } };
              if (tc.function?.arguments) toolCalls[tc.index].function.arguments += tc.function.arguments;
              if (tc.function?.name) toolCalls[tc.index].function.name = tc.function.name;
              if (tc.id) toolCalls[tc.index].id = tc.id;
            }
          }
        }
        if (chunk.choices[0]?.finish_reason) finishReason = chunk.choices[0].finish_reason;
      }

      if (finishReason === "tool_calls" && toolCalls.length > 0) {
        continueLoop = true;
        (messages as OpenAI.ChatCompletionMessageParam[]).push({ role: "assistant", content: assistantText || null, tool_calls: toolCalls });
        for (const tc of toolCalls) {
          let args: Record<string, unknown> = {};
          try { args = JSON.parse(tc.function.arguments); } catch { /* ignore */ }
          const result = await callMcpTool(tc.function.name, args, ctx, toolMap);
          (messages as OpenAI.ChatCompletionMessageParam[]).push({ role: "tool", tool_call_id: tc.id, content: result });
        }
      }
    }
  } else {
    onToken("No LLM API key configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.");
  }
}

// ── Express server ──────────────────────────────────────────────────────────

const app = express();
app.use(express.json());
app.use((_req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (_req.method === "OPTIONS") { res.sendStatus(204); return; }
  next();
});

app.get("/health", (_req, res) => { res.json({ ok: true }); });

app.get("/status", (_req, res) => {
  res.json({
    state: "ready",
    servers: STATIC_SERVERS.map((s) => ({
      label: s.label,
      connectionType: "IDENTITY_ASSERTION_CUSTOM_AS",
      active: true,
      audience: s.audience,
      issuerUrl: s.issuerUrl,
    })),
    fga: {
      storeId: OKTA_FGA_STORE_ID,
      apiUrl: OKTA_FGA_API_URL,
      authorizationModelId: OKTA_FGA_AUTHORIZATION_MODEL_ID || "(not set)",
    },
    message: `${STATIC_SERVERS.length} MCP server(s) configured, FGA checks active`,
  });
});

const seenTokenSessions = new Set<string>();

app.post("/chat", async (req: Request, res: Response): Promise<void> => {
  const { message, session_id } = req.body as { message: string; session_id?: string };
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Authorization: Bearer <id_token> required" });
    return;
  }
  const userIdToken = authHeader.slice(7);

  // Decode email from JWT (no verification — we trust the console)
  let userEmail = "user";
  try {
    const payload = JSON.parse(Buffer.from(userIdToken.split(".")[1], "base64url").toString());
    userEmail = (payload.email ?? payload.sub ?? "user") as string;
  } catch { /* fallback */ }

  const sessionKey = `${session_id ?? "default"}:${userEmail}`;
  if (!seenTokenSessions.has(sessionKey)) {
    seenTokenSessions.add(sessionKey);
    await emitEvent("Console", "user id_token received", "P7 Agent", `sub=${userEmail}`, userIdToken, "token");
  }

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Transfer-Encoding", "chunked");

  const ctx: RequestContext = {
    userIdToken,
    userEmail,
    tokenCache: new Map(),
  };

  try {
    const { tools, toolMap } = await discoverAllTools(ctx);
    await runAgentLoop(message, ctx, tools, toolMap, (text) => {
      res.write(text);
    });
  } catch (err) {
    console.error("[P7] Agent error:", err);
    res.write(`\n\n[Agent error: ${String(err)}]`);
  }
  res.end();
});

app.listen(PORT, () => {
  console.log(`[P7 Agent] Listening on :${PORT}`);
  console.log(`[P7 Agent] FGA store: ${OKTA_FGA_STORE_ID || "(not set)"}`);
  console.log(`[P7 Agent] Servers: ${STATIC_SERVERS.map((s) => s.label).join(", ") || "none"}`);
});
