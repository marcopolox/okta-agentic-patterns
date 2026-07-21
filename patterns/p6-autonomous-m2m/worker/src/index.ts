import express from "express";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SignJWT, importJWK, importPKCS8, createRemoteJWKSet, jwtVerify } from "jose";

// ── P6 A2A Worker ──────────────────────────────────────────────────────────────
// A specialized autonomous agent invoked by the P6 orchestrator via Okta A2A.
// It (1) validates the inbound A2A access token (delegation from the orchestrator),
// (2) token-exchanges THAT token for a domain resource token — carrying the
// delegation chain forward (transitive) — and (3) runs an LLM loop over its domain
// MCP tools, returning a concise analysis. Functionally this is the "act on a
// resource" core of the old Mission 2, but invoked via A2A with a delegated token.

const PORT = parseInt(process.env.PORT ?? "3601");
const EVENT_BUS_URL = process.env.EVENT_BUS_URL ?? "http://localhost:4000";
const OKTA_DOMAIN = process.env.OKTA_DOMAIN ?? "";
const WORKER_LABEL = process.env.WORKER_LABEL ?? "Worker";      // e.g. "HR" / "Finance"
const WORKER_DOMAIN = (process.env.WORKER_DOMAIN ?? "hr").toLowerCase(); // "hr" | "finance"

// Worker's own AI Agent identity — signs its OUTBOUND token-exchange (client role).
const OKTA_AI_AGENT_ID = process.env.OKTA_AI_AGENT_ID ?? "";
const OKTA_PRIVATE_KEY = process.env.OKTA_PRIVATE_KEY ?? "";

// Inbound A2A validation — the orchestrator's token is minted for this resource.
const A2A_RESOURCE = process.env.A2A_RESOURCE ?? "";            // aud the worker validates
const A2A_AUTHZ_SERVER_ID = process.env.A2A_AUTHZ_SERVER_ID ?? "";
const A2A_SCOPE = process.env.A2A_SCOPE ?? "agent.invoke";      // required inbound scope
const A2A_ISSUER = A2A_AUTHZ_SERVER_ID ? `https://${OKTA_DOMAIN}/oauth2/${A2A_AUTHZ_SERVER_ID}` : "";

// Downstream — the worker's domain resource (HR/Finance MCP) it reaches via token-exchange.
const MCP_URL = process.env.MCP_URL ?? "http://hr-server:3101";
const DOMAIN_AUTHZ_SERVER_ID = process.env.DOMAIN_AUTHZ_SERVER_ID ?? "";
const DOMAIN_RESOURCE_AUDIENCE = process.env.DOMAIN_RESOURCE_AUDIENCE ?? "";
const DOMAIN_SCOPE = process.env.DOMAIN_SCOPE ?? (WORKER_DOMAIN === "finance" ? "finance:read" : "hr:read");
const DOMAIN_ISSUER = DOMAIN_AUTHZ_SERVER_ID ? `https://${OKTA_DOMAIN}/oauth2/${DOMAIN_AUTHZ_SERVER_ID}` : "";

const ORG_TOKEN_URL = `https://${OKTA_DOMAIN}/oauth2/v1/token`;
const PATTERN_ID = "p6";
const ACTOR = `${WORKER_LABEL} Worker`;

// Token-exchange URNs — centralized so Phase 0 (validate-a2a.mjs) results lock here.
const TX = {
  requestedTokenType: "urn:ietf:params:oauth:token-type:id-jag",
  subjectTokenType: "urn:ietf:params:oauth:token-type:access_token",
};

const A2A_JWKS = A2A_ISSUER ? createRemoteJWKSet(new URL(`${A2A_ISSUER}/v1/keys`)) : null;

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

// ── Worker identity: sign client assertions (private_key_jwt) ──────────────────
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

// ── Inbound: validate the orchestrator's A2A token ─────────────────────────────
interface InboundClaims {
  sub: string;
  act?: { sub?: string };
  scp?: string[];
}

async function validateInboundToken(authHeader: string | undefined): Promise<InboundClaims> {
  if (!authHeader?.startsWith("Bearer ")) throw new Error("Missing or invalid Authorization header");
  if (!A2A_JWKS) throw new Error("Worker A2A auth server not configured (A2A_AUTHZ_SERVER_ID)");
  const token = authHeader.slice(7);

  let payload: Awaited<ReturnType<typeof jwtVerify>>["payload"];
  try {
    ({ payload } = await jwtVerify(token, A2A_JWKS, { issuer: A2A_ISSUER, audience: A2A_RESOURCE }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[${WORKER_LABEL}] inbound A2A validation failed: ${msg} | expected iss=${A2A_ISSUER} aud=${A2A_RESOURCE}`);
    throw err;
  }

  const scp = (payload.scp as string[] | undefined) ?? [];
  if (A2A_SCOPE && !scp.includes(A2A_SCOPE)) {
    throw new Error(`token missing required scope ${A2A_SCOPE} (has: ${scp.join(",") || "none"})`);
  }

  const sub = String(payload.sub ?? "unknown");
  const act = payload.act as { sub?: string } | undefined;
  const snippet = token.slice(0, 12) + "..." + token.slice(-8);
  await emitEvent(ACTOR, "validated A2A token", "Okta JWKS",
    `sub=${sub}${act?.sub ? ` act(orchestrator)=${act.sub}` : ""} scp=${scp.join(",")}`, snippet, "token", token);
  return { sub, act, scp };
}

// ── Downstream: token-exchange the A2A token for a domain resource token ───────
// Step A — token-exchange → ID-JAG (subject = the inbound A2A token; transitive delegation)
async function getDomainIdJag(subjectToken: string): Promise<string> {
  const clientAssertion = await buildAgentJwt(ORG_TOKEN_URL);
  const detail =
    `POST ${ORG_TOKEN_URL}\n` +
    `  grant_type           = urn:ietf:params:oauth:grant-type:token-exchange\n` +
    `  requested_token_type = ${TX.requestedTokenType}\n` +
    `  subject_token        = ${subjectToken.slice(0, 16)}… (A2A token from orchestrator)\n` +
    `  subject_token_type   = ${TX.subjectTokenType}\n` +
    `  audience             = ${DOMAIN_ISSUER}\n` +
    `  scope                = ${DOMAIN_SCOPE}\n` +
    `  client_assertion     = ${clientAssertion.slice(0, 16)}… (iss=sub=${OKTA_AI_AGENT_ID})`;
  await emitEvent(ACTOR, "token-exchange → ID-JAG", "Okta Org Server", detail, undefined, "auth");

  const resp = await fetch(ORG_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
      requested_token_type: TX.requestedTokenType,
      subject_token: subjectToken,
      subject_token_type: TX.subjectTokenType,
      audience: DOMAIN_ISSUER,
      scope: DOMAIN_SCOPE,
      client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
      client_assertion: clientAssertion,
    }),
  });
  if (!resp.ok) throw new Error(`domain ID-JAG exchange failed: ${resp.status} ${await resp.text()}`);
  const { access_token: idJag } = await resp.json() as { access_token: string };
  return idJag;
}

// Step B — ID-JAG → domain resource token (no scope param)
async function getDomainToken(idJag: string): Promise<string> {
  const tokenUrl = `${DOMAIN_ISSUER}/v1/token`;
  const clientAssertion = await buildAgentJwt(tokenUrl);
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
  if (!resp.ok) throw new Error(`domain resource token exchange failed: ${resp.status} ${await resp.text()}`);
  const { access_token } = await resp.json() as { access_token: string };
  const snippet = access_token.slice(0, 12) + "..." + access_token.slice(-8);
  await emitEvent(ACTOR, "obtained domain token", "Okta", `aud=${DOMAIN_RESOURCE_AUDIENCE} scope=${DOMAIN_SCOPE}`, snippet, "token", access_token);
  return access_token;
}

async function exchangeForDomainToken(subjectToken: string): Promise<string> {
  const idJag = await getDomainIdJag(subjectToken);
  return getDomainToken(idJag);
}

// ── MCP tool plumbing ──────────────────────────────────────────────────────────
interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

async function discoverToolsViaRest(): Promise<ToolDef[]> {
  const resp = await fetch(`${MCP_URL}/tools`);
  if (!resp.ok) throw new Error(`Tool discovery failed: ${resp.status}`);
  const { tools } = await resp.json() as { tools: Array<{ name: string; description: string; inputSchema?: Record<string, unknown>; requiredScopes?: string[] }> };
  // Only expose read tools the worker is scoped for (skip public/no-auth + write tools).
  const filtered = tools.filter((t) => (t.requiredScopes ?? []).includes(DOMAIN_SCOPE));
  await emitEvent(ACTOR, "discovered tools", `${WORKER_LABEL} MCP`, `count=${filtered.length}`, undefined, "info");
  return filtered.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema ?? { type: "object", properties: {} },
  }));
}

async function callMcpTool(name: string, args: Record<string, unknown>, token: string): Promise<string> {
  await emitEvent(ACTOR, "calling tool", `${WORKER_LABEL} MCP`, `tool=${name}`, undefined, "info");
  const transport = new StreamableHTTPClientTransport(
    new URL(`${MCP_URL}/mcp`),
    { requestInit: { headers: { Authorization: `Bearer ${token}`, "X-Pattern-Id": PATTERN_ID } } }
  );
  const client = new Client({ name: `p6-${WORKER_DOMAIN}-worker`, version: "1.0.0" });
  await client.connect(transport);
  try {
    const result = await client.callTool({ name, arguments: args });
    const content = result.content as { type: string; text: string }[];
    return content.filter((c) => c.type === "text").map((c) => c.text).join("\n");
  } finally {
    await client.close().catch(() => {});
  }
}

// ── LLM loop (collects full output; not streamed — the orchestrator awaits it) ──
interface Message { role: "user" | "assistant"; content: string; }
type ToolExecutor = (name: string, args: Record<string, unknown>) => Promise<string>;

async function runAgentLoop(task: string, callTool: ToolExecutor, tools: ToolDef[]): Promise<string> {
  const system = `You are the ${WORKER_LABEL} specialist worker agent in an autonomous multi-agent system. ` +
    `You were invoked by an orchestrator agent via Okta agent-to-agent (A2A) delegation — you validated its access token and are acting under delegated authority. ` +
    `Use your ${WORKER_LABEL} tools to fulfill the orchestrator's task and return a concise, well-structured analysis (markdown). ` +
    `Only use the tools available to you; never fabricate data. Return just your ${WORKER_LABEL} findings — the orchestrator will combine them with other workers' results.`;
  const messages: Message[] = [{ role: "user", content: task }];
  if (process.env.ANTHROPIC_API_KEY) return runAnthropic(messages, system, callTool, tools);
  if (process.env.OPENAI_API_KEY) return runOpenAI(messages, system, callTool, tools);
  return "No LLM API key configured (ANTHROPIC_API_KEY / OPENAI_API_KEY).";
}

async function runAnthropic(messages: Message[], system: string, callTool: ToolExecutor, tools: ToolDef[]): Promise<string> {
  const anthropic = new Anthropic();
  const anthropicTools: Anthropic.Tool[] = tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema as Anthropic.Tool["input_schema"] }));
  let msgs: Anthropic.MessageParam[] = messages.map((m) => ({ role: m.role, content: m.content }));
  let out = "";
  while (true) {
    const response = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL ?? "claude-opus-4-7",
      max_tokens: 4096, system, messages: msgs, tools: anthropicTools,
    });
    const textBlocks = response.content.filter((b): b is Anthropic.TextBlock => b.type === "text");
    const toolBlocks = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (textBlocks.length > 0) out += textBlocks.map((b) => b.text).join("");
    if (response.stop_reason !== "tool_use" || toolBlocks.length === 0) break;
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const tool of toolBlocks) {
      const result = await callTool(tool.name, tool.input as Record<string, unknown>);
      toolResults.push({ type: "tool_result", tool_use_id: tool.id, content: result });
    }
    msgs = [...msgs, { role: "assistant", content: response.content }, { role: "user", content: toolResults }];
  }
  return out;
}

async function runOpenAI(messages: Message[], system: string, callTool: ToolExecutor, tools: ToolDef[]): Promise<string> {
  const openai = new OpenAI();
  const openaiTools: OpenAI.ChatCompletionTool[] = tools.map((t) => ({ type: "function" as const, function: { name: t.name, description: t.description, parameters: t.inputSchema } }));
  let msgs: OpenAI.ChatCompletionMessageParam[] = [{ role: "system", content: system }, ...messages.map((m) => ({ role: m.role, content: m.content }))];
  let out = "";
  while (true) {
    const response = await openai.chat.completions.create({ model: process.env.OPENAI_MODEL ?? "gpt-4o", messages: msgs, tools: openaiTools });
    const choice = response.choices[0];
    if (choice.message.content) out += choice.message.content;
    if (choice.finish_reason !== "tool_calls" || !choice.message.tool_calls?.length) break;
    const toolResults: OpenAI.ChatCompletionToolMessageParam[] = [];
    for (const tc of choice.message.tool_calls) {
      const args = JSON.parse(tc.function.arguments) as Record<string, unknown>;
      const result = await callTool(tc.function.name, args);
      toolResults.push({ role: "tool", tool_call_id: tc.id, content: result });
    }
    msgs = [...msgs, choice.message, ...toolResults];
  }
  return out;
}

// ── Express ──────────────────────────────────────────────────────────────────
const app = express();
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") { res.sendStatus(200); return; }
  next();
});
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: `p6-${WORKER_DOMAIN}-worker`, label: WORKER_LABEL });
});

app.post("/invoke", async (req, res) => {
  const { task } = req.body as { task?: string };
  if (!task) { res.status(400).json({ error: "task required" }); return; }

  // 1. Validate the orchestrator's A2A token (delegation gate)
  let claims: InboundClaims;
  try {
    claims = await validateInboundToken(req.headers.authorization);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unauthorized";
    if (req.headers.authorization) await emitEvent(ACTOR, "rejected invocation", "orchestrator", msg, undefined, "error");
    res.status(401).json({ error: msg });
    return;
  }

  await emitEvent(ACTOR, "spawned", "orchestrator", `delegated by ${claims.act?.sub ?? claims.sub}`, undefined, "info");

  try {
    // 2. Carry the chain forward: exchange the A2A token for a domain resource token
    const domainToken = await exchangeForDomainToken(req.headers.authorization!.slice(7));

    // 3. Run the domain LLM loop over MCP tools
    const tools = await discoverToolsViaRest();
    const callTool: ToolExecutor = (name, args) => callMcpTool(name, args, domainToken);
    const summary = await runAgentLoop(task, callTool, tools);

    await emitEvent(ACTOR, "torn down", "orchestrator", "task complete", undefined, "info");
    res.json({ ok: true, label: WORKER_LABEL, summary });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error(`[${WORKER_LABEL}] invoke error:`, msg);
    await emitEvent(ACTOR, "task failed", "error", msg, undefined, "error");
    await emitEvent(ACTOR, "torn down", "orchestrator", "task failed", undefined, "info");
    res.status(500).json({ ok: false, label: WORKER_LABEL, error: msg });
  }
});

app.listen(PORT, () => {
  console.log(`P6 ${WORKER_LABEL} worker listening on :${PORT}`);
  console.log(`  A2A resource (inbound aud) = ${A2A_RESOURCE || "(unset)"}  issuer = ${A2A_ISSUER || "(unset)"}`);
  console.log(`  domain MCP = ${MCP_URL}  domain issuer = ${DOMAIN_ISSUER || "(unset)"}  scope = ${DOMAIN_SCOPE}`);
  emitEvent(ACTOR, "started", "event-bus", `port=${PORT} identity=${OKTA_AI_AGENT_ID || "not configured"}`, undefined, "info");
});
