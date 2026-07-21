import express from "express";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { SignJWT, importJWK, importPKCS8, createRemoteJWKSet, jwtVerify } from "jose";

// ── P6 Orchestrator — Agent-to-Agent (A2A) delegation ──────────────────────────
// A user authenticates through the console (app) and kicks off the orchestrator,
// which acts on the user's behalf (same entry point as P3/P4 — "User sign-on").
// The orchestrator takes the user's token and exchanges it (per worker) for an
// `agent.invoke`-scoped A2A token — authorized by an Okta delegation link — to
// invoke specialized worker agents. Each worker carries the delegation chain
// forward (token-exchange → its domain resource). The orchestrator never touches
// the HR/Finance resources directly. Difference from P3: an extra agent hop
// (user → orchestrator → worker → resource) instead of (user → agent → resource).

const PORT = parseInt(process.env.PORT ?? "3600");
const EVENT_BUS_URL = process.env.EVENT_BUS_URL ?? "http://localhost:4000";
const OKTA_DOMAIN = process.env.OKTA_DOMAIN ?? "";

// Orchestrator AI Agent identity — signs client assertions for the A2A exchange.
const OKTA_AI_AGENT_ID = process.env.OKTA_AI_AGENT_ID ?? "";
const OKTA_PRIVATE_KEY = process.env.OKTA_PRIVATE_KEY ?? "";

const OKTA_API_TOKEN = process.env.OKTA_API_TOKEN ?? "";
const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN ?? "";
const SLACK_DEFAULT_CHANNEL = process.env.SLACK_DEFAULT_CHANNEL ?? "general";

const ORG_TOKEN_URL = `https://${OKTA_DOMAIN}/oauth2/v1/token`;
const PATTERN_ID = "p6";

// Orchestrator as a resource — Mission 1 (CC/autonomous): the console mints a CC token
// targeting this resource; the orchestrator validates it as the inbound Bearer.
const ORCH_A2A_RESOURCE = process.env.ORCH_A2A_RESOURCE ?? "";
const ORCH_A2A_AUTHZ_SERVER_ID = process.env.ORCH_A2A_AUTHZ_SERVER_ID ?? "";
const ORCH_A2A_ISSUER = ORCH_A2A_AUTHZ_SERVER_ID ? `https://${OKTA_DOMAIN}/oauth2/${ORCH_A2A_AUTHZ_SERVER_ID}` : "";
const ORCH_JWKS = ORCH_A2A_ISSUER ? createRemoteJWKSet(new URL(`${ORCH_A2A_ISSUER}/v1/keys`)) : null;

// Token-exchange URNs + A2A scope — centralized so Phase 0 (validate-a2a.mjs) locks here.
const TX = {
  requestedTokenType: "urn:ietf:params:oauth:token-type:id-jag",
  // The orchestrator's subject is the user's token forwarded by the console (id_token, P3-style).
  subjectTokenType: "urn:ietf:params:oauth:token-type:id_token",
  a2aScope: "agent.invoke",
  // Step 1: audience = worker A2A AS issuer URL; resource = worker HTTPS resourceUrl (https://hr.agent / https://fin.agent)
};
// Mission 1 (CC/autonomous): subject is the console's CC access_token, not a user id_token.
const TX_CC = { ...TX, subjectTokenType: "urn:ietf:params:oauth:token-type:access_token" };

// ── Worker registry (env-driven; refined by the Okta Connections API) ──────────
interface WorkerCfg {
  key: string;          // "hr" | "finance" — drives the tool name invoke_<key>_worker
  label: string;        // "HR" | "Finance"
  resourceOrn: string;  // A2A resource ORN — used to match Connections API response
  resourceUrl: string;  // HTTPS resourceUrl — audience for Step 1 ID-JAG exchange (e.g. https://hr.agent)
  a2aIssuerUrl: string; // issuer of the worker's A2A auth server
  workerUrl: string;    // docker-internal HTTP endpoint
  active: boolean;
}

interface StatusConnection {
  label: string;
  connectionType: string;
  active: boolean;
  audience?: string;
  issuerUrl?: string;
}

type LoadState = "loading" | "ready" | "fallback";

// Static config from env — each worker the orchestrator can delegate to.
function envWorkers(): WorkerCfg[] {
  const defs: Array<{ key: string; label: string; resource?: string; resourceUrl?: string; authz?: string; url?: string }> = [
    { key: "hr", label: "HR", resource: process.env.HR_WORKER_A2A_RESOURCE, resourceUrl: process.env.HR_WORKER_RESOURCE_URL, authz: process.env.HR_WORKER_A2A_AUTHZ_SERVER_ID, url: process.env.HR_WORKER_URL },
    { key: "finance", label: "Finance", resource: process.env.FINANCE_WORKER_A2A_RESOURCE, resourceUrl: process.env.FINANCE_WORKER_RESOURCE_URL, authz: process.env.FINANCE_WORKER_A2A_AUTHZ_SERVER_ID, url: process.env.FINANCE_WORKER_URL },
  ];
  return defs
    .filter((d) => d.resourceUrl && d.url)
    .map((d) => ({
      key: d.key,
      label: d.label,
      resourceOrn: d.resource ?? "",
      resourceUrl: d.resourceUrl!,
      a2aIssuerUrl: d.authz ? `https://${OKTA_DOMAIN}/oauth2/${d.authz}` : "",
      workerUrl: d.url!,
      active: true,
    }));
}

let discoveredWorkers: WorkerCfg[] = [];
let statusConnections: StatusConnection[] = [];
let loadState: LoadState = "loading";
let loadFallbackReason = "";

interface OktaConnection {
  id: string;
  name?: string;
  connectionType: string;
  status: string;
  resourceIndicator?: string;
  resource?: { orn?: string; name?: string };
  authorizationServer?: { issuerUrl?: string; orn?: string; name?: string };
}

function activateFallback(reason: string): void {
  loadFallbackReason = reason;
  loadState = "fallback";
  discoveredWorkers = envWorkers();
  statusConnections = discoveredWorkers.map((w) => ({
    label: `${w.label} Worker`, connectionType: "IDENTITY_ASSERTION_A2A_SERVER", active: true, audience: w.resourceUrl, issuerUrl: w.a2aIssuerUrl,
  }));
  console.warn(`[Okta] A2A fallback (${reason}): using env worker config for ${discoveredWorkers.map((w) => w.label).join(", ") || "(none)"}`);
}

// Discover A2A worker connections from the Okta AI Agent Connections API.
async function loadA2AConnections(): Promise<void> {
  loadFallbackReason = "";
  const envMap = new Map(envWorkers().map((w) => [w.resourceOrn, w]));
  if (!OKTA_API_TOKEN) { activateFallback("no API token"); return; }

  const url = `https://${OKTA_DOMAIN}/workload-principals/api/v1/ai-agents/${OKTA_AI_AGENT_ID}/connections?limit=200`;
  let connections: OktaConnection[];
  try {
    const resp = await fetch(url, { headers: { Authorization: `SSWS ${OKTA_API_TOKEN}`, Accept: "application/json" } });
    if (!resp.ok) { activateFallback(`API error ${resp.status}`); return; }
    const data = await resp.json();
    connections = Array.isArray(data) ? data : (data.data ?? data.value ?? data.connections ?? data.items ?? []);
    if (!Array.isArray(connections)) { activateFallback("unexpected API response shape"); return; }
  } catch (err) {
    console.warn("[Okta] A2A Connections API unreachable:", err);
    activateFallback("API unreachable");
    return;
  }

  const a2a = connections.filter((c) => c.connectionType === "IDENTITY_ASSERTION_A2A_SERVER");
  console.log(`[Okta] Found ${a2a.length} A2A connection(s) of ${connections.length} total`);
  a2a.forEach((c) => {
    const orn = c.resourceIndicator ?? c.resource?.orn ?? "(none)";
    const issuer = c.authorizationServer?.issuerUrl ?? "(none)";
    console.log(`[Okta]   ${c.resource?.name ?? "?"}: status=${c.status} issuerUrl=${issuer} orn=${orn}`);
  });

  discoveredWorkers = a2a
    .filter((c) => c.status === "ACTIVE")
    .flatMap((c) => {
      const orn = c.resourceIndicator ?? c.resource?.orn;
      const env = orn ? envMap.get(orn) : undefined;
      if (!orn || !env) return [];
      return [{
        ...env,
        a2aIssuerUrl: c.authorizationServer?.issuerUrl ?? env.a2aIssuerUrl,
        active: true,
      }];
    });

  statusConnections = a2a.map((c) => {
    const orn = c.resourceIndicator ?? c.resource?.orn;
    const env = orn ? envMap.get(orn) : undefined;
    return {
      label: env ? `${env.label} Worker` : (c.resource?.name ?? c.name ?? "A2A Worker"),
      connectionType: c.connectionType,
      active: c.status === "ACTIVE",
      audience: orn,
      issuerUrl: c.authorizationServer?.issuerUrl,
    };
  });

  loadState = "ready";
  console.log(`[Okta] Loaded ${discoveredWorkers.length} active A2A worker(s): ${discoveredWorkers.map((w) => w.label).join(", ") || "(none)"}`);
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

// ── Orchestrator identity: sign client assertions (private_key_jwt) ────────────
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

// The orchestrator's subject is the user's token (forwarded by the console after
// the user signs in through the app). Decode it for the user's display name.
function decodeJwtPayload(token: string): Record<string, unknown> {
  try {
    const b64 = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(Buffer.from(b64, "base64").toString("utf8"));
  } catch {
    return {};
  }
}

// ── Inbound CC token validation (Mission 1 — autonomous /invoke) ─────────────────
interface InboundCCClaims { sub: string; scp: string[]; }
async function validateInboundCCToken(authHeader: string | undefined): Promise<InboundCCClaims> {
  if (!authHeader?.startsWith("Bearer ")) throw new Error("Missing Authorization header");
  if (!ORCH_JWKS) throw new Error("Orchestrator A2A auth server not configured (ORCH_A2A_AUTHZ_SERVER_ID)");
  const token = authHeader.slice(7);
  const { payload } = await jwtVerify(token, ORCH_JWKS, { issuer: ORCH_A2A_ISSUER, audience: ORCH_A2A_RESOURCE });
  const scp = (payload.scp as string[] | undefined) ?? [];
  if (!scp.includes("agent.invoke")) throw new Error("token missing required scope agent.invoke");
  return { sub: payload.sub ?? "autonomous", scp };
}

// ── A2A exchange: subject token → worker A2A token (act = orchestrator) ─────────
async function getA2AIdJag(subjectToken: string, worker: WorkerCfg, tx = TX): Promise<string> {
  // audience = worker A2A AS issuer URL; resource = worker HTTPS resourceUrl (https://hr.agent / https://fin.agent)
  const audience = worker.a2aIssuerUrl;
  const resource = worker.resourceUrl;
  console.log(`[A2A] step1 audience=${audience} resource=${resource}`);
  const clientAssertion = await buildAgentJwt(ORG_TOKEN_URL);
  const detail =
    `POST ${ORG_TOKEN_URL}\n` +
    `  grant_type           = urn:ietf:params:oauth:grant-type:token-exchange\n` +
    `  requested_token_type = ${tx.requestedTokenType}\n` +
    `  subject_token        = ${subjectToken.slice(0, 16)}… (orchestrator subject)\n` +
    `  subject_token_type   = ${tx.subjectTokenType}\n` +
    `  audience             = ${audience}\n` +
    `  resource             = ${resource}\n` +
    `  scope                = ${tx.a2aScope}\n` +
    `  client_assertion     = ${clientAssertion.slice(0, 16)}… (iss=sub=${OKTA_AI_AGENT_ID})`;
  await emitEvent("P6 Orchestrator", "A2A token-exchange → ID-JAG", `Okta / ${worker.label} A2A`, detail, undefined, "auth");

  const resp = await fetch(ORG_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
      requested_token_type: tx.requestedTokenType,
      subject_token: subjectToken,
      subject_token_type: tx.subjectTokenType,
      audience,
      resource,
      scope: tx.a2aScope,
      client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
      client_assertion: clientAssertion,
    }),
  });
  if (!resp.ok) throw new Error(`A2A ID-JAG exchange failed (${worker.label}): ${resp.status} ${await resp.text()}`);
  const { access_token: idJag } = await resp.json() as { access_token: string };
  return idJag;
}

async function getA2AToken(idJag: string, worker: WorkerCfg): Promise<string> {
  const tokenUrl = `${worker.a2aIssuerUrl}/v1/token`;
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
  if (!resp.ok) throw new Error(`A2A resource token exchange failed (${worker.label}): ${resp.status} ${await resp.text()}`);
  const { access_token } = await resp.json() as { access_token: string };
  const snippet = access_token.slice(0, 12) + "..." + access_token.slice(-8);
  await emitEvent("Okta", `A2A token issued (${worker.label})`, `${OKTA_AI_AGENT_ID} → ${worker.label} Worker`, `scope=${TX.a2aScope} act=${OKTA_AI_AGENT_ID}`, snippet, "token", access_token);
  return access_token;
}

async function invokeWorker(worker: WorkerCfg, subjectToken: string, task: string, tx = TX): Promise<string> {
  const idJag = await getA2AIdJag(subjectToken, worker, tx);
  const a2aToken = await getA2AToken(idJag, worker);
  await emitEvent("P6 Orchestrator", "invoking worker", `${worker.label} Worker`, `task=${task.slice(0, 80)}`, undefined, "info");

  const resp = await fetch(`${worker.workerUrl}/invoke`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${a2aToken}` },
    body: JSON.stringify({ task }),
  });
  const data = await resp.json().catch(() => ({})) as { ok?: boolean; summary?: string; error?: string };
  if (!resp.ok || !data.ok) {
    const msg = data.error ?? `HTTP ${resp.status}`;
    await emitEvent("P6 Orchestrator", "worker failed", `${worker.label} Worker`, msg, undefined, "error");
    return `[${worker.label} Worker error] ${msg}`;
  }
  await emitEvent("P6 Orchestrator", "worker result received", `${worker.label} Worker`, "summary returned", undefined, "success");
  return data.summary ?? "(no summary)";
}

// ── Slack ──────────────────────────────────────────────────────────────────────
async function postSlackMessage(text: string, channel?: string, slackToken?: string): Promise<string> {
  const target = channel ?? SLACK_DEFAULT_CHANNEL;
  const token = slackToken || SLACK_BOT_TOKEN;
  if (!token) {
    await emitEvent("Slack", "skipped (no bot token)", `#${target}`, "SLACK_BOT_TOKEN not set", undefined, "error");
    return `[Slack post skipped — SLACK_BOT_TOKEN not configured] Message that would be sent:\n${text}`;
  }
  await emitEvent("P6 Orchestrator", "posting to Slack", `#${target}`, "bot token", undefined, "info");
  const resp = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ channel: target, text }),
  });
  const data = await resp.json() as { ok: boolean; error?: string };
  if (!data.ok) {
    await emitEvent("Slack", "post failed", `#${target}`, data.error ?? "unknown error", undefined, "error");
    return `Slack post failed: ${data.error ?? "unknown error"}`;
  }
  await emitEvent("Slack", "message posted", `#${target}`, "report delivered", undefined, "success");
  return `Successfully posted report to #${target}`;
}

// ── Tool definitions: one invoke_<key>_worker per active worker + Slack ────────
interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

const SLACK_TOOL: ToolDef = {
  name: "post_slack_message",
  description: "Post the final report to a Slack channel. Use this once after gathering worker results.",
  inputSchema: {
    type: "object",
    properties: {
      text: { type: "string", description: "Report text (Slack markdown: *bold*, `code`, bullet lists)" },
      channel: { type: "string", description: `Channel name without # (defaults to ${SLACK_DEFAULT_CHANNEL})` },
    },
    required: ["text"],
  },
};

function buildTools(workers: WorkerCfg[]): ToolDef[] {
  const workerTools = workers.map((w) => ({
    name: `invoke_${w.key}_worker`,
    description: `Delegate a task to the ${w.label} Worker agent via Okta A2A. The worker accesses ${w.label} data on your behalf (delegated identity) and returns an analysis. Provide a clear natural-language task.`,
    inputSchema: {
      type: "object",
      properties: { task: { type: "string", description: `What the ${w.label} Worker should do` } },
      required: ["task"],
    },
  }));
  return [...workerTools, SLACK_TOOL];
}

// ── LLM agent loop (streamed to the console) ───────────────────────────────────
interface Message { role: "user" | "assistant"; content: string; }
type ToolExecutor = (name: string, args: Record<string, unknown>) => Promise<string>;
interface LLMOverrides { anthropicKey?: string; openaiKey?: string; }

async function* runAgentLoop(userMessage: string, history: Message[], callTool: ToolExecutor, tools: ToolDef[], workerLabels: string[], overrides?: LLMOverrides): AsyncGenerator<string> {
  const messages: Message[] = [...history, { role: "user", content: userMessage }];
  const workerList = workerLabels.length ? workerLabels.join(" and ") : "(none configured)";
  const system = `You are a fully autonomous orchestrator AI agent (P6). You were triggered without direct human interaction (cron/app/user). ` +
    `You do NOT access HR or Finance systems yourself — instead you delegate to specialized worker agents via Okta agent-to-agent (A2A) delegation. ` +
    `Available worker agents: ${workerList}. ` +
    `Your job: 1) delegate the right sub-tasks to the worker agents using their invoke_*_worker tools, 2) combine their results into one clear report, 3) post the report to Slack with post_slack_message. ` +
    `Use Slack markdown (*bold*, \`code\`, bullet lists). Always complete the full workflow including the Slack post.`;
  if (overrides?.anthropicKey || process.env.ANTHROPIC_API_KEY) {
    yield* runAnthropic(messages, system, callTool, tools, overrides);
  } else if (overrides?.openaiKey || process.env.OPENAI_API_KEY) {
    yield* runOpenAI(messages, system, callTool, tools, overrides);
  } else {
    yield "No LLM API key configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.";
  }
}

async function* runAnthropic(messages: Message[], system: string, callTool: ToolExecutor, tools: ToolDef[], overrides?: LLMOverrides): AsyncGenerator<string> {
  const anthropic = new Anthropic({ ...(overrides?.anthropicKey && { apiKey: overrides.anthropicKey }) });
  const anthropicTools: Anthropic.Tool[] = tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema as Anthropic.Tool["input_schema"] }));
  let msgs: Anthropic.MessageParam[] = messages.map((m) => ({ role: m.role, content: m.content }));
  while (true) {
    const response = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL ?? "claude-opus-4-7",
      max_tokens: 4096, system, messages: msgs, tools: anthropicTools,
    });
    const textBlocks = response.content.filter((b): b is Anthropic.TextBlock => b.type === "text");
    const toolBlocks = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (textBlocks.length > 0) yield textBlocks.map((b) => b.text).join("");
    if (response.stop_reason !== "tool_use" || toolBlocks.length === 0) break;
    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const tool of toolBlocks) {
      const result = await callTool(tool.name, tool.input as Record<string, unknown>);
      toolResults.push({ type: "tool_result", tool_use_id: tool.id, content: result });
    }
    msgs = [...msgs, { role: "assistant", content: response.content }, { role: "user", content: toolResults }];
  }
}

async function* runOpenAI(messages: Message[], system: string, callTool: ToolExecutor, tools: ToolDef[], overrides?: LLMOverrides): AsyncGenerator<string> {
  const openai = new OpenAI({ ...(overrides?.openaiKey && { apiKey: overrides.openaiKey }) });
  const openaiTools: OpenAI.ChatCompletionTool[] = tools.map((t) => ({ type: "function" as const, function: { name: t.name, description: t.description, parameters: t.inputSchema } }));
  let msgs: OpenAI.ChatCompletionMessageParam[] = [{ role: "system", content: system }, ...messages.map((m) => ({ role: m.role, content: m.content }))];
  while (true) {
    const response = await openai.chat.completions.create({ model: process.env.OPENAI_MODEL ?? "gpt-4o", messages: msgs, tools: openaiTools });
    const choice = response.choices[0];
    if (choice.message.content) yield choice.message.content;
    if (choice.finish_reason !== "tool_calls" || !choice.message.tool_calls?.length) break;
    const toolResults: OpenAI.ChatCompletionToolMessageParam[] = [];
    for (const tc of choice.message.tool_calls) {
      const args = JSON.parse(tc.function.arguments) as Record<string, unknown>;
      const result = await callTool(tc.function.name, args);
      toolResults.push({ role: "tool", tool_call_id: tc.id, content: result });
    }
    msgs = [...msgs, choice.message, ...toolResults];
  }
}

// ── The A2A run — user-delegated (the user's token is the subject) ─────────────
async function* runOrchestration(message: string, history: Message[], userToken: string, overrides?: LLMOverrides, slackToken?: string, slackChannel?: string, tx = TX): AsyncGenerator<string> {
  if (discoveredWorkers.length === 0) {
    yield "No A2A worker agents are configured/active. Provision the worker A2A servers, connections, and delegation links in Okta, then set the P6_*_WORKER_* env vars.";
    return;
  }

  const workers = new Map(discoveredWorkers.map((w) => [`invoke_${w.key}_worker`, w]));
  const tools = buildTools(discoveredWorkers);

  const callTool: ToolExecutor = async (name, args) => {
    if (name === "post_slack_message") return postSlackMessage(args.text as string, (args.channel as string | undefined) ?? slackChannel, slackToken);
    const worker = workers.get(name);
    if (!worker) return `Unknown tool: ${name}`;
    return invokeWorker(worker, userToken, String(args.task ?? ""), tx);
  };

  yield* runAgentLoop(message, history, callTool, tools, discoveredWorkers.map((w) => w.label), overrides);
}

// ── Express server ───────────────────────────────────────────────────────────
const app = express();
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-LLM-Api-Key, X-LLM-Provider, X-Slack-Token, X-Slack-Channel");
  if (req.method === "OPTIONS") { res.sendStatus(200); return; }
  next();
});
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "p6-agent" });
});

app.get("/status", (_req, res) => {
  res.json({
    state: loadState,
    servers: statusConnections,
    fallbackReason: loadFallbackReason || undefined,
    message: loadState === "loading"
      ? "Discovering A2A worker connections from Okta..."
      : loadState === "fallback"
        ? `Using env worker config (${loadFallbackReason || "Okta API unavailable"})`
        : `${discoveredWorkers.length} active A2A worker(s) discovered`,
  });
});

app.post("/refresh", async (_req, res) => {
  await loadA2AConnections();
  res.json({ state: loadState, servers: statusConnections, fallbackReason: loadFallbackReason || undefined });
});

const sessions = new Map<string, Message[]>();
const seenTokenSessions = new Set<string>();

app.post("/chat", async (req, res) => {
  const { message, session_id } = req.body as { message: string; session_id?: string };
  if (!message) { res.status(400).json({ error: "message required" }); return; }

  const llmOverrides: LLMOverrides = {
    anthropicKey: req.headers["x-llm-api-key"] && req.headers["x-llm-provider"] !== "openai"
      ? String(req.headers["x-llm-api-key"]) : undefined,
    openaiKey: req.headers["x-llm-api-key"] && req.headers["x-llm-provider"] === "openai"
      ? String(req.headers["x-llm-api-key"]) : undefined,
  };
  const slackToken = req.headers["x-slack-token"] ? String(req.headers["x-slack-token"]) : undefined;
  const slackChannel = req.headers["x-slack-channel"] ? String(req.headers["x-slack-channel"]) : undefined;

  // User sign-on: the orchestrator acts on the authenticated user's behalf (P3-style).
  const authHeader = req.headers.authorization;
  const userToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!userToken) {
    await emitEvent("P6 Orchestrator", "rejected request", "chat", "missing user token — log in first", undefined, "error");
    res.status(401).json({ error: "User token required — log in first" });
    return;
  }

  const sid = session_id ?? "default";
  const history = sessions.get(sid) ?? [];

  if (!seenTokenSessions.has(sid)) {
    seenTokenSessions.add(sid);
    const claims = decodeJwtPayload(userToken);
    const userName = (claims.name ?? claims.email ?? "User") as string;
    await emitEvent("P6 Orchestrator", "user token received", "Okta", `user=${userName}`, undefined, "token", userToken);
  }

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Transfer-Encoding", "chunked");

  try {
    let fullResponse = "";
    for await (const chunk of runOrchestration(message, history, userToken, llmOverrides, slackToken, slackChannel)) {
      fullResponse += chunk;
      res.write(chunk);
    }
    const updated: Message[] = [...history, { role: "user", content: message }, { role: "assistant", content: fullResponse }];
    sessions.set(sid, updated.slice(-20));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[chat error]", msg);
    emitEvent("P6 Orchestrator", "orchestration failed", "error", msg, undefined, "error").catch(() => {});
    res.write(`Error: ${msg}`);
  }
  res.end();
});

const invokeSessions = new Map<string, Message[]>();

app.post("/invoke", async (req, res) => {
  const { message, session_id } = req.body as { message: string; session_id?: string };
  if (!message) { res.status(400).json({ error: "message required" }); return; }
  let claims: InboundCCClaims;
  try {
    claims = await validateInboundCCToken(req.headers.authorization);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Token validation failed";
    await emitEvent("P6 Orchestrator", "rejected /invoke", "CC token", msg, undefined, "error");
    res.status(401).json({ error: msg });
    return;
  }
  await emitEvent("P6 Orchestrator", "CC token validated", "Okta", `sub=${claims.sub} scope=${claims.scp.join(",")}`, undefined, "token");
  const sid = session_id ?? "invoke-default";
  const history = invokeSessions.get(sid) ?? [];
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Transfer-Encoding", "chunked");
  const ccToken = req.headers.authorization!.slice(7);
  try {
    let fullResponse = "";
    for await (const chunk of runOrchestration(message, history, ccToken, undefined, undefined, undefined, TX_CC)) {
      fullResponse += chunk;
      res.write(chunk);
    }
    const updated: Message[] = [...history, { role: "user", content: message }, { role: "assistant", content: fullResponse }];
    invokeSessions.set(sid, updated.slice(-20));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("[invoke error]", msg);
    emitEvent("P6 Orchestrator", "orchestration failed", "error", msg, undefined, "error").catch(() => {});
    res.write(`Error: ${msg}`);
  }
  res.end();
});

app.listen(PORT, () => {
  console.log(`P6 orchestrator listening on :${PORT}`);
  emitEvent("P6 Orchestrator", "started", "event-bus", `port=${PORT} identity=${OKTA_AI_AGENT_ID || "not configured"}`, undefined, "info");
  loadA2AConnections().catch((err) => console.warn("A2A connection load failed:", err));
});
