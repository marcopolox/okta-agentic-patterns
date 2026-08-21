import express from "express";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { randomBytes, createHash } from "crypto";

const PORT = parseInt(process.env.PORT ?? "3200");
const EVENT_BUS_URL = process.env.EVENT_BUS_URL ?? "http://localhost:4000";
// Internal URL for API calls from the Docker container to the standalone adapter
const MCP_ADAPTER_URL = process.env.MCP_ADAPTER_URL ?? "http://localhost:8008";
// Browser-accessible URL used to build auth links shown to the user
const MCP_ADAPTER_PUBLIC_URL = process.env.MCP_ADAPTER_PUBLIC_URL ?? MCP_ADAPTER_URL;
// Inventory resource server — used directly (bypassing the adapter) for anonymous public-catalog
// browsing, since the adapter requires auth on every MCP call and has no anonymous discovery path.
const INVENTORY_SERVER_URL = process.env.INVENTORY_SERVER_URL ?? "http://localhost:3103";
// Console base URL — combined with /callback to form the PKCE redirect_uri
const CONSOLE_URL = process.env.CONSOLE_URL ?? "http://localhost:3020";
const REDIRECT_URI = `${CONSOLE_URL}/callback`;
const PATTERN_ID = "p2";

async function emitEvent(
  actor: string,
  action: string,
  target: string,
  detail?: string,
  tokenSnippet?: string,
  level = "auth",
  token?: string
) {
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

// ── PKCE helpers ──────────────────────────────────────────────────────────────

function generateCodeVerifier(): string {
  return randomBytes(32).toString("base64url");
}

function deriveCodeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

// ── DCR ───────────────────────────────────────────────────────────────────────

interface DcrRegistration {
  clientId: string;
  clientSecret: string;
}

async function performDcr(): Promise<DcrRegistration> {
  await emitEvent("Consumer Agent", "requesting registration", "MCP Adapter", `DCR → ${MCP_ADAPTER_URL}/.well-known/oauth/registration`, undefined, "auth");
  const res = await fetch(`${MCP_ADAPTER_URL}/.well-known/oauth/registration`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_name: "P2 Consumer Agent",
      redirect_uris: [REDIRECT_URI],
      grant_types: ["authorization_code"],
      response_types: ["code"],
      token_endpoint_auth_method: "client_secret_basic",
      code_challenge_method: "S256",
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`DCR failed ${res.status}: ${body}`);
  }
  const data = await res.json() as { client_id: string; client_secret: string };
  await emitEvent(
    "MCP Adapter",
    "issued client_id",
    "Consumer Agent",
    `client_id=${data.client_id}`,
    data.client_id,
    "auth"
  );
  return { clientId: data.client_id, clientSecret: data.client_secret };
}

// ── Auth URL builder ──────────────────────────────────────────────────────────

interface PkceState {
  cid: string;  // client_id from DCR
  cs: string;   // client_secret from DCR
  cv: string;   // code_verifier (for token exchange)
  ru: string;   // redirect_uri
}

function buildAdapterAuthUrl(dcr: DcrRegistration): { url: string; codeVerifier: string } {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = deriveCodeChallenge(codeVerifier);
  const pkceState: PkceState = { cid: dcr.clientId, cs: dcr.clientSecret, cv: codeVerifier, ru: REDIRECT_URI };
  const state = Buffer.from(JSON.stringify(pkceState)).toString("base64url");

  const url = new URL(`${MCP_ADAPTER_PUBLIC_URL}/oauth/authorize`);
  url.searchParams.set("client_id", dcr.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", REDIRECT_URI);
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", state);
  return { url: url.toString(), codeVerifier };
}

// ── Session store ─────────────────────────────────────────────────────────────

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface SessionState {
  messages: Message[];
  dcr?: DcrRegistration;
}

const sessions = new Map<string, SessionState>();

// ── Tool definitions ──────────────────────────────────────────────────────────

interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

const PUBLIC_TOOLS = new Set(["get_product_catalog"]);

const SYSTEM_WITH_TOOLS = "You are a helpful inventory assistant. Use the available tools to answer questions about product availability, stock levels, order status, and product details. Be concise and informative.";

function buildPublicOnlySystem(authLink: string): string {
  return `You are a helpful inventory assistant. You have access to the public product catalog — use it to list products and categories.

If the user asks about stock levels, order status, or specific product details that require authentication, tell them you need authorization and include this exact markdown link: ${authLink}

Never fabricate stock numbers or order details.`;
}

// ── MCP client ────────────────────────────────────────────────────────────────

async function getMcpClient(accessToken?: string): Promise<{ client: Client; tools: ToolDef[] }> {
  const headers: Record<string, string> = {};
  // Authenticated calls go through the adapter (DCR/PKCE flow, real 3rd-party OAuth pattern).
  // Unauthenticated browsing connects directly to the resource server, which already has its
  // own public/private tool gating — the adapter has no anonymous discovery path.
  const baseUrl = accessToken ? MCP_ADAPTER_URL : INVENTORY_SERVER_URL;
  if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;
  // The adapter proxies multiple resources — inventory-server is registered there as
  // "okta-demo-inventory", so authenticated calls must target its namespaced path.
  // Unauthenticated calls bypass the adapter entirely (bare /mcp on inventory-server directly).
  const mcpPath = accessToken ? "/okta-demo-inventory/mcp" : "/mcp";
  const transport = new StreamableHTTPClientTransport(
    new URL(`${baseUrl}${mcpPath}`),
    { requestInit: { headers } }
  );
  const client = new Client({ name: "p2-consumer-agent", version: "1.0.0" });
  await client.connect(transport);
  const { tools } = await client.listTools();
  const visibleTools = accessToken ? tools : tools.filter((t) => PUBLIC_TOOLS.has(t.name));
  await emitEvent(
    "Consumer Agent",
    "discovered tools",
    accessToken ? "MCP Adapter" : "Inventory Server",
    `count=${visibleTools.length}${accessToken ? " (full access)" : " (public only)"}`,
    undefined,
    "info"
  );
  return {
    client,
    tools: visibleTools.map((t) => ({
      name: t.name,
      description: t.description ?? "",
      inputSchema: (t.inputSchema ?? { type: "object", properties: {} }) as Record<string, unknown>,
    })),
  };
}

interface TextContent { type: "text"; text: string }

async function callMcpTool(client: Client, name: string, args: Record<string, unknown>): Promise<string> {
  await emitEvent("Consumer Agent", "calling tool", "MCP Adapter", `tool=${name}`, undefined, "info");
  const result = await client.callTool({ name, arguments: args });
  const content = result.content as TextContent[];
  return content.filter((c) => c.type === "text").map((c) => c.text).join("\n");
}

// ── LLM loop ──────────────────────────────────────────────────────────────────

interface LLMOverrides { anthropicKey?: string; openaiKey?: string; litellmKey?: string; litellmBaseUrl?: string; litellmModel?: string; }

async function* runAgentLoop(
  userMessage: string,
  history: Message[],
  client: Client | null,
  tools: ToolDef[],
  system: string,
  overrides?: LLMOverrides,
  signal?: AbortSignal
): AsyncGenerator<string> {
  const messages: Message[] = [...history, { role: "user", content: userMessage }];
  if (overrides?.litellmKey && overrides?.litellmBaseUrl) {
    yield* runOpenAI(messages, system, client, tools, overrides, signal);
  } else if (overrides?.anthropicKey || process.env.ANTHROPIC_API_KEY) {
    yield* runAnthropic(messages, system, client, tools, overrides, signal);
  } else if (overrides?.openaiKey || process.env.OPENAI_API_KEY) {
    yield* runOpenAI(messages, system, client, tools, overrides, signal);
  } else {
    yield "No LLM API key configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.";
  }
}

async function* runAnthropic(
  messages: Message[],
  system: string,
  client: Client | null,
  tools: ToolDef[],
  overrides?: LLMOverrides,
  signal?: AbortSignal
): AsyncGenerator<string> {
  const anthropic = new Anthropic({ ...(overrides?.anthropicKey && { apiKey: overrides.anthropicKey }) });
  const anthropicTools: Anthropic.Tool[] = tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema as Anthropic.Tool["input_schema"],
  }));
  let msgs: Anthropic.MessageParam[] = messages.map((m) => ({ role: m.role, content: m.content }));

  while (true) {
    if (signal?.aborted) return;
    const response = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL ?? "claude-opus-4-7",
      max_tokens: 4096,
      system,
      messages: msgs,
      tools: anthropicTools.length > 0 ? anthropicTools : undefined,
    });
    const textBlocks = response.content.filter((b): b is Anthropic.TextBlock => b.type === "text");
    const toolBlocks = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (textBlocks.length > 0) yield textBlocks.map((b) => b.text).join("");
    if (response.stop_reason !== "tool_use" || toolBlocks.length === 0) break;

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const tool of toolBlocks) {
      if (signal?.aborted) { toolResults.push({ type: "tool_result", tool_use_id: tool.id, content: "cancelled" }); continue; }
      if (!client) {
        toolResults.push({ type: "tool_result", tool_use_id: tool.id, content: "Not authorized." });
        continue;
      }
      const result = await callMcpTool(client, tool.name, tool.input as Record<string, unknown>);
      toolResults.push({ type: "tool_result", tool_use_id: tool.id, content: result });
    }
    await emitEvent("Consumer Agent", "tool results ready", "LLM", "Data received from all the tools. Sent to LLM for processing.", undefined, "info");
    msgs = [...msgs, { role: "assistant", content: response.content }, { role: "user", content: toolResults }];
  }
}

async function* runOpenAI(
  messages: Message[],
  system: string,
  client: Client | null,
  tools: ToolDef[],
  overrides?: LLMOverrides,
  signal?: AbortSignal
): AsyncGenerator<string> {
  const openai = overrides?.litellmKey && overrides?.litellmBaseUrl
    ? new OpenAI({ apiKey: overrides.litellmKey, baseURL: overrides.litellmBaseUrl })
    : new OpenAI({ ...(overrides?.openaiKey && { apiKey: overrides.openaiKey }) });
  const openaiTools: OpenAI.ChatCompletionTool[] = tools.map((t) => ({
    type: "function" as const,
    function: { name: t.name, description: t.description, parameters: t.inputSchema },
  }));
  let msgs: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: system },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  while (true) {
    if (signal?.aborted) return;
    const response = await openai.chat.completions.create({
      model: overrides?.litellmModel || process.env.OPENAI_MODEL || "gpt-4o",
      messages: msgs,
      tools: openaiTools.length > 0 ? openaiTools : undefined,
    });
    const choice = response.choices[0];
    if (choice.message.content) yield choice.message.content;
    if (choice.finish_reason !== "tool_calls" || !choice.message.tool_calls?.length) break;

    const toolResults: OpenAI.ChatCompletionToolMessageParam[] = [];
    for (const tc of choice.message.tool_calls) {
      if (signal?.aborted) { toolResults.push({ role: "tool", tool_call_id: tc.id, content: "cancelled" }); continue; }
      if (!client) {
        toolResults.push({ role: "tool", tool_call_id: tc.id, content: "Not authorized." });
        continue;
      }
      const args = JSON.parse(tc.function.arguments) as Record<string, unknown>;
      const result = await callMcpTool(client, tc.function.name, args);
      toolResults.push({ role: "tool", tool_call_id: tc.id, content: result });
    }
    await emitEvent("Consumer Agent", "tool results ready", "LLM", "Data received from all the tools. Sent to LLM for processing.", undefined, "info");
    msgs = [...msgs, choice.message, ...toolResults];
  }
}

// ── Express server ────────────────────────────────────────────────────────────

const app = express();
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-LLM-Api-Key, X-LLM-Provider, X-LLM-Base-Url, X-LLM-Model, X-Slack-Token, X-Slack-Channel");
  if (req.method === "OPTIONS") { res.sendStatus(200); return; }
  next();
});
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "p2-agent" });
});

app.post("/chat", async (req, res) => {
  const { message, session_id } = req.body as { message: string; session_id?: string };
  if (!message) { res.status(400).json({ error: "message required" }); return; }

  const llmOverrides: LLMOverrides = {
    anthropicKey: req.headers["x-llm-api-key"] && req.headers["x-llm-provider"] !== "openai" && req.headers["x-llm-provider"] !== "litellm"
      ? String(req.headers["x-llm-api-key"]) : undefined,
    openaiKey: req.headers["x-llm-api-key"] && req.headers["x-llm-provider"] === "openai"
      ? String(req.headers["x-llm-api-key"]) : undefined,
    litellmKey: req.headers["x-llm-api-key"] && req.headers["x-llm-provider"] === "litellm"
      ? String(req.headers["x-llm-api-key"]) : undefined,
    litellmBaseUrl: req.headers["x-llm-base-url"] ? String(req.headers["x-llm-base-url"]) : undefined,
    litellmModel: req.headers["x-llm-model"] ? String(req.headers["x-llm-model"]) : undefined,
  };

  const authHeader = req.headers.authorization;
  const accessToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  const sid = session_id ?? "default";
  let session = sessions.get(sid);
  if (!session) {
    session = { messages: [] };
    sessions.set(sid, session);
  }

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Transfer-Encoding", "chunked");

  let client: Client | null = null;
  let tools: ToolDef[] = [];
  let system: string;

  if (accessToken) {
    const snippet = accessToken.slice(0, 12) + "..." + accessToken.slice(-8);
    await emitEvent("Consumer Agent", "received access_token", "agent", "connecting to MCP Adapter with user token", snippet, "token", accessToken);

    try {
      ({ client, tools } = await getMcpClient(accessToken));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "MCP connection error";
      await emitEvent("Consumer Agent", "MCP connection failed", "MCP Adapter", msg, undefined, "error");
      res.write(`Error connecting to MCP Adapter: ${msg}`);
      res.end();
      return;
    }
    system = SYSTEM_WITH_TOOLS;
  } else {
    // Unauthenticated — ensure we have a DCR registration for this session, then build auth URL
    await emitEvent("Consumer Agent", "received request", "agent", "no token — browsing mode (public tools only)", undefined, "info");

    if (!session.dcr) {
      try {
        session.dcr = await performDcr();
      } catch (err) {
        const msg = err instanceof Error ? err.message : "DCR error";
        await emitEvent("Consumer Agent", "DCR failed", "MCP Adapter", msg, undefined, "error");
        res.write(`Error registering with MCP Adapter: ${msg}`);
        res.end();
        return;
      }
    }

    const { url: adapterAuthUrl } = buildAdapterAuthUrl(session.dcr);
    // Wrap in a console-side shim so the chat panel can intercept the click for session preservation
    const startUrl = `/api/auth/start/p2?to=${Buffer.from(adapterAuthUrl).toString("base64url")}`;
    const authLink = `[Authorize this agent](${startUrl})`;

    await emitEvent("Consumer Agent", "authorization required", "User", `auth URL constructed, client_id=${session.dcr.clientId}`, undefined, "auth");

    try {
      ({ client, tools } = await getMcpClient());
    } catch (err) {
      const msg = err instanceof Error ? err.message : "MCP connection error";
      await emitEvent("Consumer Agent", "MCP connection failed", "MCP Adapter", msg, undefined, "error");
      res.write(`Error connecting to MCP Adapter: ${msg}`);
      res.end();
      return;
    }
    system = buildPublicOnlySystem(authLink);
  }

  const controller = new AbortController();
  // req 'close' fires as soon as the request body is read, not when the response
  // finishes — aborting on it kills the LLM call almost immediately on every
  // request. res 'close' fires when the connection actually ends; writableEnded
  // distinguishes a normal finish from a real client disconnect.
  res.on("close", () => { if (!res.writableEnded) controller.abort(); });

  const history = session.messages;
  let fullResponse = "";
  try {
    for await (const chunk of runAgentLoop(message, history, client, tools, system, llmOverrides, controller.signal)) {
      fullResponse += chunk;
      res.write(chunk);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    await emitEvent("Consumer Agent", "chat error", "agent", msg, undefined, "error");
    res.write(`Error: ${msg}`);
  } finally {
    if (client) await client.close();
  }

  session.messages = [
    ...history,
    { role: "user" as const, content: message },
    { role: "assistant" as const, content: fullResponse },
  ].slice(-20);

  res.end();
});

app.listen(PORT, () => {
  console.log(`P2 consumer agent listening on :${PORT}`);
  emitEvent("Consumer Agent", "started", "event-bus", `port=${PORT}`, undefined, "info");
});
