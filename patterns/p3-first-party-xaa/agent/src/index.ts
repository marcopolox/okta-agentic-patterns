import express from "express";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SignJWT, importJWK, importPKCS8 } from "jose";

const PORT = parseInt(process.env.PORT ?? "3300");
const EVENT_BUS_URL = process.env.EVENT_BUS_URL ?? "http://localhost:4000";
const OKTA_DOMAIN = process.env.OKTA_DOMAIN ?? "";
const OKTA_AI_AGENT_ID = process.env.OKTA_AI_AGENT_ID ?? "";
const OKTA_PRIVATE_KEY = process.env.OKTA_PRIVATE_KEY ?? "";
const HR_API_URL = process.env.PROTECTED_API_URL ?? "http://hr-server:3101";
const FINANCE_API_URL = process.env.FINANCE_API_URL ?? "http://finance-server:3102";
// Audience strings: link Docker-internal URLs to Okta connections; also used for static fallback
const HR_RESOURCE_AUDIENCE = process.env.HR_RESOURCE_AUDIENCE ?? "";
const FINANCE_RESOURCE_AUDIENCE = process.env.FINANCE_RESOURCE_AUDIENCE ?? "";
// Auth server IDs: only used for static fallback when Okta Connections API is unreachable
const HR_AUTHZ_SERVER_ID = process.env.HR_AUTHZ_SERVER_ID ?? "";
const FINANCE_AUTHZ_SERVER_ID = process.env.FINANCE_AUTHZ_SERVER_ID ?? "";
const OKTA_API_TOKEN = process.env.OKTA_API_TOKEN ?? "";
const SLACK_STS_RESOURCE = process.env.SLACK_STS_RESOURCE ?? "";
const PATTERN_ID = "p3";

interface DiscoveredServer {
  label: string;       // display name (e.g. "HR")
  url: string;         // Docker-internal MCP server URL
  audience: string;    // token audience = Okta connection resourceIndicator
  issuerUrl: string;   // full OAuth issuer URL from Okta connection
  scopes: string[];    // scopes the agent may request for this server
}

interface OktaConnection {
  id: string;
  name?: string;           // human-readable connection name from Okta Admin
  connectionType: string;
  status: string;
  resourceIndicator?: string;
  authorizationServer?: { issuerUrl: string; orn: string; name?: string };
  scopeCondition?: string;
  scopes?: string[];
}

type LoadState = "loading" | "ready" | "fallback";

interface StatusConnection {
  label: string;
  connectionType: string;
  active: boolean;
  audience?: string;
  issuerUrl?: string;
}

// Loaded once at startup; contains all active IDENTITY_ASSERTION_CUSTOM_AS connections
let discoveredServers: DiscoveredServer[] = [];
// All active connections of any type — used for status reporting only
let statusConnections: StatusConnection[] = [];
let loadState: LoadState = "loading";
let loadFallbackReason = "";

type DynamicToolMap = Map<string, DiscoveredServer>;

// Known scope sets per audience — used when Okta returns scopeCondition="ALL_SCOPES" (scopes: ["*"])
const AUDIENCE_SCOPES: Record<string, string[]> = {
  "api:hr":      ["hr:read", "hr:write", "hr:delete"],
  "api:finance": ["finance:read", "finance:write", "finance:approve"],
};

// Name-pattern heuristic: pick the minimum scope needed for a tool call
const WRITE_PREFIXES = ["update_", "create_", "delete_", "post_", "write_", "set_", "add_", "remove_"];

function getScopesForTool(toolName: string, availableScopes: string[]): string[] {
  const isWrite = WRITE_PREFIXES.some(p => toolName.startsWith(p));
  const preferred = isWrite
    ? availableScopes.filter(s => s.endsWith(":write"))
    : availableScopes.filter(s => s.endsWith(":read"));
  return preferred.length > 0 ? preferred : availableScopes;
}

function activateFallback(reason: string): void {
  const servers: DiscoveredServer[] = [];
  if (HR_API_URL && HR_RESOURCE_AUDIENCE && HR_AUTHZ_SERVER_ID) {
    servers.push({
      label: "HR",
      url: HR_API_URL,
      audience: HR_RESOURCE_AUDIENCE,
      issuerUrl: `https://${OKTA_DOMAIN}/oauth2/${HR_AUTHZ_SERVER_ID}`,
      scopes: AUDIENCE_SCOPES[HR_RESOURCE_AUDIENCE] ?? ["hr:read", "hr:write", "hr:delete"],
    });
  }
  if (FINANCE_API_URL && FINANCE_RESOURCE_AUDIENCE && FINANCE_AUTHZ_SERVER_ID) {
    servers.push({
      label: "Finance",
      url: FINANCE_API_URL,
      audience: FINANCE_RESOURCE_AUDIENCE,
      issuerUrl: `https://${OKTA_DOMAIN}/oauth2/${FINANCE_AUTHZ_SERVER_ID}`,
      scopes: AUDIENCE_SCOPES[FINANCE_RESOURCE_AUDIENCE] ?? ["finance:read", "finance:write", "finance:approve"],
    });
  }
  loadFallbackReason = reason;
  loadState = "fallback";
  if (servers.length > 0) {
    discoveredServers = servers;
    console.warn(`[Okta] Fallback mode active (${reason}): using static env var config for ${servers.map(s => s.label).join(", ")}`);
  } else {
    console.warn(`[Okta] Fallback mode: no static config available — agent will have no tools`);
  }
  statusConnections = [
    ...servers.map(s => ({ label: s.label, connectionType: "IDENTITY_ASSERTION_CUSTOM_AS", active: true, audience: s.audience, issuerUrl: s.issuerUrl })),
    ...(SLACK_STS_RESOURCE ? [{ label: "Slack", connectionType: "STS", active: true }] : []),
  ];
}

async function loadAgentConnections(): Promise<void> {
  loadFallbackReason = "";
  if (!OKTA_API_TOKEN) {
    console.warn("[Okta] OKTA_API_TOKEN not set — activating static fallback");
    activateFallback("no API token");
    return;
  }

  const url = `https://${OKTA_DOMAIN}/workload-principals/api/v1/ai-agents/${OKTA_AI_AGENT_ID}/connections?limit=200`;
  let connections: OktaConnection[];
  try {
    const resp = await fetch(url, {
      headers: { Authorization: `SSWS ${OKTA_API_TOKEN}`, Accept: "application/json" },
    });
    if (!resp.ok) {
      const body = await resp.text().catch(() => "(unreadable)");
      console.warn(`[Okta] Connections API returned ${resp.status}: ${body.slice(0, 300)}`);
      activateFallback(`API error ${resp.status}`);
      return;
    }
    const data = await resp.json();
    connections = Array.isArray(data) ? data : (data.data ?? data.value ?? data.connections ?? data.items ?? []);
    if (!Array.isArray(connections)) {
      console.warn("[Okta] Unexpected Connections API response shape:", JSON.stringify(data).slice(0, 200));
      activateFallback("unexpected API response shape");
      return;
    }
  } catch (err) {
    console.warn("[Okta] Connections API unreachable — activating static fallback:", err);
    activateFallback("API unreachable");
    return;
  }

  // URL map: audience → { label, url } — used to resolve Docker-internal URLs
  const serverUrls: Record<string, { label: string; url: string }> = {};
  if (HR_API_URL && HR_RESOURCE_AUDIENCE)           serverUrls[HR_RESOURCE_AUDIENCE]      = { label: "HR",      url: HR_API_URL };
  if (FINANCE_API_URL && FINANCE_RESOURCE_AUDIENCE) serverUrls[FINANCE_RESOURCE_AUDIENCE] = { label: "Finance", url: FINANCE_API_URL };

  const activeConnections = connections.filter(c => c.status === "ACTIVE");
  console.log(`[Okta] Found ${activeConnections.length}/${connections.length} active connection(s) across all types`);
  for (const c of connections) {
    console.log(`  type=${c.connectionType} status=${c.status} resource=${c.resourceIndicator ?? "n/a"} issuer=${c.authorizationServer?.issuerUrl ?? "n/a"}`);
  }

  // XAA connections: build discoveredServers for MCP tool calling (active only)
  discoveredServers = activeConnections
    .filter(c => c.connectionType === "IDENTITY_ASSERTION_CUSTOM_AS")
    .flatMap(c => {
      const entry = c.resourceIndicator ? serverUrls[c.resourceIndicator] : undefined;
      if (!entry || !c.authorizationServer?.issuerUrl) return [];
      const rawScopes = c.scopes ?? [];
      const scopes = rawScopes.length === 1 && rawScopes[0] === "*"
        ? (AUDIENCE_SCOPES[c.resourceIndicator!] ?? rawScopes)
        : rawScopes;
      return [{
        label: entry.label,
        url: entry.url,
        audience: c.resourceIndicator!,
        issuerUrl: c.authorizationServer.issuerUrl,
        scopes,
      }];
    });

  // ORN → label map for known STS resources
  const ornLabels: Record<string, string> = {};
  if (SLACK_STS_RESOURCE) ornLabels[SLACK_STS_RESOURCE] = "Slack";

  // All connections (active + inactive) for status reporting
  // Label priority: c.name (from Okta Admin) → env var map → authzServer name → ORN segment → connectionType
  statusConnections = connections.map(c => {
    const isActive = c.status === "ACTIVE";
    if (c.connectionType === "IDENTITY_ASSERTION_CUSTOM_AS") {
      const entry = c.resourceIndicator ? serverUrls[c.resourceIndicator] : undefined;
      const label = entry?.label
        ?? c.name
        ?? (c.resourceIndicator ? c.resourceIndicator.split(":").pop()! : c.authorizationServer?.name ?? c.connectionType);
      return { label, connectionType: c.connectionType, active: isActive, audience: c.resourceIndicator, issuerUrl: c.authorizationServer?.issuerUrl };
    }
    // STS and other types
    const rawLabel = (c.resourceIndicator && ornLabels[c.resourceIndicator])
      ?? c.name
      ?? c.authorizationServer?.name
      ?? (c.resourceIndicator ? c.resourceIndicator.split(":").pop()! : c.connectionType);
    const label = rawLabel.charAt(0).toUpperCase() + rawLabel.slice(1);
    return { label, connectionType: c.connectionType, active: isActive, audience: c.resourceIndicator };
  });

  loadState = "ready";
  console.log(`[Okta] Loaded ${discoveredServers.length} XAA server(s), ${statusConnections.length} total connection(s)`);
  for (const s of discoveredServers) {
    console.log(`  XAA ${s.label}: issuer=${s.issuerUrl} audience=${s.audience} scopes=[${s.scopes.join(",")}]`);
  }
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

interface RequestContext {
  userIdToken: string;
  tokenCache: Map<string, string>; // "server:scope1 scope2" → resource token
}

// XAA Step 1: id_token → ID-JAG at Okta org server
// issuerUrl = target auth server URL; scope = scopes to embed in the ID-JAG
async function getIdJag(userIdToken: string, issuerUrl: string, scopes: string[], label: string): Promise<string> {
  const orgTokenUrl = `https://${OKTA_DOMAIN}/oauth2/v1/token`;
  const authzUrl = issuerUrl;
  const scope = scopes.join(" ");

  const clientAssertion = await buildAgentJwt(orgTokenUrl);

  const p = (s: string) => s.padEnd(24);
  const requestDetail =
    `POST ${orgTokenUrl}\n` +
    `  ${p("grant_type")} = urn:ietf:params:oauth:grant-type:token-exchange\n` +
    `  ${p("requested_token_type")} = urn:ietf:params:oauth:token-type:id-jag\n` +
    `  ${p("subject_token")} = ${userIdToken.slice(0, 16)}… (user id_token)\n` +
    `  ${p("subject_token_type")} = urn:ietf:params:oauth:token-type:id_token\n` +
    `  ${p("audience")} = ${authzUrl}\n` +
    `  ${p("scope")} = ${scope}\n` +
    `  ${p("client_assertion_type")} = urn:ietf:params:oauth:client-assertion-type:jwt-bearer\n` +
    `  ${p("client_assertion")} = ${clientAssertion.slice(0, 20)}… (iss=sub=${OKTA_AI_AGENT_ID})`;

  console.log(`\n[XAA Step 1 — ID-JAG Request]\n  ${requestDetail.replace(/\n/g, "\n  ")}`);
  await emitEvent("P3 Agent", "XAA Step 1 — ID-JAG request", "Okta Org Server", requestDetail, undefined, "auth");

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
    throw new Error(`ID-JAG exchange failed (${label}): ${resp.status} ${text}`);
  }

  const { access_token: idJag } = await resp.json() as { access_token: string };
  const snippet = idJag.slice(0, 12) + "..." + idJag.slice(-8);
  await emitEvent("P3 Agent", "obtained ID-JAG", "Okta", `${label} user+agent identity`, snippet, "token", idJag);
  return idJag;
}

// XAA Step 2: ID-JAG → resource token at target auth server (scope param must be absent)
async function getStep2Token(idJag: string, issuerUrl: string, audience: string, label: string): Promise<string> {
  const authzTokenUrl = `${issuerUrl}/v1/token`;

  const clientAssertion = await buildAgentJwt(authzTokenUrl);

  const p2 = (s: string) => s.padEnd(24);
  const requestDetail2 =
    `POST ${authzTokenUrl}\n` +
    `  ${p2("grant_type")} = urn:ietf:params:oauth:grant-type:jwt-bearer\n` +
    `  ${p2("assertion")} = ${idJag.slice(0, 16)}… (ID-JAG from Step 1)\n` +
    `  ${p2("client_assertion_type")} = urn:ietf:params:oauth:client-assertion-type:jwt-bearer\n` +
    `  ${p2("client_assertion")} = ${clientAssertion.slice(0, 20)}… (iss=sub=${OKTA_AI_AGENT_ID})\n` +
    `  [scope omitted — scopes are locked inside the ID-JAG]`;

  console.log(`\n[XAA Step 2 — Resource Token Request]\n  ${requestDetail2.replace(/\n/g, "\n  ")}`);
  await emitEvent("P3 Agent", "XAA Step 2 — resource token request", label, requestDetail2, undefined, "auth");

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
    throw new Error(`Resource token exchange failed (${label}): ${resp.status} ${text}`);
  }

  const { access_token: resourceToken } = await resp.json() as { access_token: string };
  const snippet = resourceToken.slice(0, 12) + "..." + resourceToken.slice(-8);
  await emitEvent("P3 Agent", "obtained resource token", "Okta", `${label} aud=${audience}`, snippet, "token", resourceToken);
  return resourceToken;
}

// Returns a resource token for a server+scope combination, reusing cached tokens within a request
async function getTokenForServer(server: DiscoveredServer, scopes: string[], ctx: RequestContext): Promise<string> {
  const cacheKey = `${server.issuerUrl}:${[...scopes].sort().join(" ")}`;
  if (ctx.tokenCache.has(cacheKey)) return ctx.tokenCache.get(cacheKey)!;

  const idJag = await getIdJag(ctx.userIdToken, server.issuerUrl, scopes, server.label);
  const token = await getStep2Token(idJag, server.issuerUrl, server.audience, server.label);
  ctx.tokenCache.set(cacheKey, token);
  return token;
}

// ── Slack via Okta STS ────────────────────────────────────────────────────────

type StsResult =
  | { kind: "token"; accessToken: string }
  | { kind: "interaction_required"; errorUri: string }
  | { kind: "error"; message: string };

async function exchangeForSlackToken(userIdToken: string): Promise<StsResult> {
  const orgTokenUrl = `https://${OKTA_DOMAIN}/oauth2/v1/token`;
  const clientAssertion = await buildAgentJwt(orgTokenUrl);
  const params = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
    requested_token_type: "urn:okta:params:oauth:token-type:oauth-sts",
    subject_token: userIdToken,
    subject_token_type: "urn:ietf:params:oauth:token-type:id_token",
    client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
    client_assertion: clientAssertion,
    resource: SLACK_STS_RESOURCE,
  });
  try {
    const res = await fetch(orgTokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
    });
    const body = await res.json() as Record<string, unknown>;
    if (res.ok && body.access_token) return { kind: "token", accessToken: body.access_token as string };
    if (body.error === "interaction_required" && body.interaction_uri) {
      return { kind: "interaction_required", errorUri: body.interaction_uri as string };
    }
    return { kind: "error", message: `${body.error}: ${body.error_description}` };
  } catch (err) {
    return { kind: "error", message: err instanceof Error ? err.message : "STS exchange failed" };
  }
}

const SLACK_TOOLS = [
  {
    name: "slack_list_channels",
    description: "List public Slack channels in the workspace.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max channels to return (default 20)" },
      },
    },
  },
  {
    name: "slack_post_message",
    description: "Post a message to a Slack channel on behalf of the user.",
    inputSchema: {
      type: "object",
      properties: {
        channel: { type: "string", description: "Channel name (without #) or channel ID" },
        text: { type: "string", description: "Message text to post" },
      },
      required: ["channel", "text"],
    },
  },
];

async function callSlackTool(name: string, args: Record<string, unknown>, userIdToken: string): Promise<string> {
  await emitEvent("P3 Agent", "requesting STS token exchange", "Okta STS", `resource=Slack tool=${name}`, undefined, "auth");
  const stsResult = await exchangeForSlackToken(userIdToken);
  if (stsResult.kind === "interaction_required") {
    await emitEvent("Okta STS", "interaction_required", "P3 Agent", "Slack not linked to Okta", undefined, "auth");
    return `To use Slack, please link your Slack account with Okta first: [Authorize Slack → Okta](${stsResult.errorUri})\n\nAfter authorizing, return here and try again.`;
  }
  if (stsResult.kind === "error") {
    await emitEvent("Okta STS", "STS exchange failed", "P3 Agent", stsResult.message, undefined, "error");
    return `Slack authorization failed: ${stsResult.message}`;
  }
  const token = stsResult.accessToken;
  const snippet = `${token.slice(0, 20)}…`;
  await emitEvent("Okta STS", "Slack token obtained", "P3 Agent", `tool=${name}`, snippet, "token", token);

  await emitEvent("P3 Agent", "calling tool", "Slack API", `tool=${name}`, undefined, "info");
  try {
    let data: unknown;
    if (name === "slack_list_channels") {
      const url = new URL("https://slack.com/api/conversations.list");
      url.searchParams.set("limit", String(args.limit ?? 20));
      url.searchParams.set("exclude_archived", "true");
      const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
      data = await res.json();
    } else if (name === "slack_post_message") {
      const res = await fetch("https://slack.com/api/chat.postMessage", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ channel: args.channel, text: args.text }),
      });
      data = await res.json();
    } else {
      return `Unknown Slack tool: ${name}`;
    }
    const body = data as Record<string, unknown>;
    if (!body.ok) {
      const errMsg = String(body.error ?? "unknown");
      if (errMsg.includes("missing_scope")) {
        await emitEvent("Okta STS", "bot token lacks chat:write", "Slack", "admin must add chat:write scope", undefined, "error");
        return "The Slack bot token doesn't have `chat:write` scope. An Okta admin must add `chat:write` and `chat:write.public` to the Slack app's OAuth scopes in Okta Admin → Applications, then reinstall the app.";
      }
      throw new Error(`Slack API error: ${errMsg}`);
    }
    await emitEvent("Okta STS", "Slack token used", "Slack API", `tool=${name}`, undefined, "token");
    await emitEvent("Slack API", "called tool", name, undefined, undefined, "info");
    return JSON.stringify(data, null, 2);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await emitEvent("P3 Agent", "tool error", "Slack API", msg, undefined, "error");
    return `Error: ${msg}`;
  }
}

interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

// Discover tools via GET /tools (no auth) — avoids eagerly fetching tokens for servers not needed
async function discoverToolsViaRest(serverUrl: string, label: string): Promise<ToolDef[]> {
  const resp = await fetch(`${serverUrl}/tools`);
  if (!resp.ok) throw new Error(`Tool discovery failed for ${label}: ${resp.status}`);
  const { tools } = await resp.json() as { tools: Array<{ name: string; description: string; inputSchema?: Record<string, unknown> }> };
  await emitEvent("P3 Agent", "discovered tools", label, `count=${tools.length}`, undefined, "info");
  return tools.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: t.inputSchema ?? { type: "object", properties: {} },
  }));
}

// Per-call MCP invocation: acquire scoped token → one-shot client → call tool → close
async function callMcpTool(name: string, args: Record<string, unknown>, ctx: RequestContext, toolMap: DynamicToolMap): Promise<string> {
  const server = toolMap.get(name);
  if (!server) throw new Error(`Unknown tool: ${name}`);

  const scopes = getScopesForTool(name, server.scopes);
  const label = `${server.label} Server`;

  let token: string;
  try {
    token = await getTokenForServer(server, scopes, ctx);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "XAA failed";
    await emitEvent(label, "policy denied", name, msg, undefined, "error");
    return `Access to "${name}" is not permitted for this user due to an Okta policy restriction.`;
  }

  await emitEvent("P3 Agent", "calling tool", label, `tool=${name} scopes=${scopes.join(",")}`, undefined, "info");

  const transport = new StreamableHTTPClientTransport(
    new URL(`${server.url}/mcp`),
    { requestInit: { headers: { Authorization: `Bearer ${token}`, "X-Pattern-Id": PATTERN_ID } } }
  );
  const client = new Client({ name: "p3-agent", version: "1.0.0" });
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

interface LLMOverrides { anthropicKey?: string; openaiKey?: string; }

type ToolExecutor = (name: string, args: Record<string, unknown>) => Promise<string>;

async function* runAgentLoop(
  userMessage: string,
  history: Message[],
  callTool: ToolExecutor,
  tools: ToolDef[],
  userName: string,
  restrictionNote = "",
  overrides?: LLMOverrides
): AsyncGenerator<string> {
  const messages: Message[] = [...history, { role: "user", content: userMessage }];
  const isFirstMessage = history.length === 0;
  const greetInstruction = isFirstMessage ? `Start your response by greeting ${userName} by name. ` : "";
  const slackNote = SLACK_STS_RESOURCE ? " When slack tools are available, you can use them to post summaries or reports to Slack channels." : "";
  const system = `${greetInstruction}You are a helpful internal assistant acting on behalf of ${userName}. Use the available tools to answer questions about employees, departments, budgets, and finances.${slackNote}${restrictionNote} Be concise and informative. When presenting lists of employees or departments, format them as readable markdown tables or structured lists with clear headings — never dump raw JSON.`;

  if (overrides?.anthropicKey || process.env.ANTHROPIC_API_KEY) {
    yield* runAnthropic(messages, system, callTool, tools, overrides);
  } else if (overrides?.openaiKey || process.env.OPENAI_API_KEY) {
    yield* runOpenAI(messages, system, callTool, tools, overrides);
  } else {
    yield "No LLM API key configured. Set ANTHROPIC_API_KEY or OPENAI_API_KEY.";
  }
}

async function* runAnthropic(
  messages: Message[],
  system: string,
  callTool: ToolExecutor,
  tools: ToolDef[],
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
      const result = await callTool(tool.name, tool.input as Record<string, unknown>);
      toolResults.push({ type: "tool_result", tool_use_id: tool.id, content: result });
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
  callTool: ToolExecutor,
  tools: ToolDef[],
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
      const result = await callTool(tc.function.name, args);
      toolResults.push({ role: "tool", tool_call_id: tc.id, content: result });
    }

    msgs = [...msgs, choice.message, ...toolResults];
  }
}

// ── Express server ────────────────────────────────────────────────────────────

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
  res.json({ ok: true, service: "p3-agent" });
});

app.get("/status", (_req, res) => {
  res.json({
    state: loadState,
    servers: statusConnections,
    fallbackReason: loadFallbackReason || undefined,
    message: loadState === "loading"
      ? "Fetching connections from Okta AI Agent Connections API..."
      : loadState === "fallback"
        ? `Using static env var config (${loadFallbackReason || "Okta API unavailable"})`
        : `Loaded ${statusConnections.length} connection(s) from Okta`,
  });
});

app.post("/refresh", async (_req, res) => {
  await loadAgentConnections();
  res.json({
    state: loadState,
    servers: statusConnections,
    fallbackReason: loadFallbackReason || undefined,
    message: loadState === "fallback"
      ? `Using static env var config (${loadFallbackReason || "Okta API unavailable"})`
      : `Loaded ${statusConnections.length} connection(s) from Okta`,
  });
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
    await emitEvent("P3 Agent", "rejected request", "chat", "missing user ID token", undefined, "error");
    res.status(401).json({ error: "User ID token required — log in first" });
    return;
  }

  const sid = session_id ?? "default";
  const history = sessions.get(sid) ?? [];
  const claims = decodeJwtPayload(userIdToken);
  const userName = (claims.name ?? claims.email ?? "User") as string;

  if (!seenTokenSessions.has(sid)) {
    seenTokenSessions.add(sid);
    await emitEvent("P3 Agent", "user id_token received", "Okta", `user=${userName}`, undefined, "token", userIdToken);
    if (loadState === "fallback") {
      await emitEvent("P3 Agent", "fallback mode active", "Okta Connections API", `Okta API was unreachable at startup — using static env var config (${loadFallbackReason})`, undefined, "warn");
    }
  }

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Transfer-Encoding", "chunked");

  try {
    const ctx: RequestContext = { userIdToken, tokenCache: new Map() };

    // Build dynamic tool map from Okta-discovered connections
    const toolMap: DynamicToolMap = new Map();
    let mcpTools: ToolDef[] = [];
    try {
      for (const server of discoveredServers) {
        const serverTools = await discoverToolsViaRest(server.url, `${server.label} Server`);
        for (const tool of serverTools) toolMap.set(tool.name, server);
        mcpTools.push(...serverTools);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Initialization error";
      await emitEvent("P3 Agent", "initialization failed", "agent", msg, undefined, "error");
      res.write(`Error: ${msg}`);
      res.end();
      return;
    }

    // Pre-check XAA read access for each discovered server; filter out tools for restricted servers
    const restrictedServerLabels: string[] = [];
    for (const server of discoveredServers) {
      const readScopes = server.scopes.filter(s => s.endsWith(":read"));
      const scopes = readScopes.length > 0 ? readScopes : server.scopes.slice(0, 1);
      try {
        await getTokenForServer(server, scopes, ctx);
      } catch {
        const label = `${server.label} Server`;
        await emitEvent(label, "policy denied", "P3 Agent", "read access blocked by Okta", undefined, "error");
        mcpTools = mcpTools.filter((t) => toolMap.get(t.name) !== server);
        restrictedServerLabels.push(label);
      }
    }

    // Inactive connections were never added to discoveredServers; collect them so the LLM
    // knows not to fabricate data for resources it has no tools for
    const inactiveServerLabels = statusConnections
      .filter(c => !c.active && c.connectionType === "IDENTITY_ASSERTION_CUSTOM_AS")
      .map(c => `${c.label} Server`);

    const allUnavailableLabels = [...restrictedServerLabels, ...inactiveServerLabels];
    const restrictionNote = allUnavailableLabels.length > 0
      ? ` IMPORTANT: The following resources are currently unavailable: ${allUnavailableLabels.join(", ")}. ${inactiveServerLabels.length > 0 ? `${inactiveServerLabels.join(" and ")} ${inactiveServerLabels.length === 1 ? "is" : "are"} inactive in Okta — no tools exist for ${inactiveServerLabels.length === 1 ? "it" : "them"}. ` : ""}Do NOT make up, estimate, or infer any data for unavailable resources. Always call available tools to retrieve whatever partial results you can. After presenting the data you were able to retrieve, add a clear note that the unavailable resource(s) could not be accessed${restrictedServerLabels.length > 0 ? " due to an Okta access policy" : " because the Okta connection is inactive"}.`
      : "";

    const tools: ToolDef[] = [...mcpTools, ...(SLACK_STS_RESOURCE ? SLACK_TOOLS : [])];

    const callTool: ToolExecutor = (name, args) => {
      if (name.startsWith("slack_")) return callSlackTool(name, args, userIdToken);
      return callMcpTool(name, args, ctx, toolMap);
    };

    let fullResponse = "";
    for await (const chunk of runAgentLoop(message, history, callTool, tools, userName, restrictionNote, llmOverrides)) {
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
  console.log(`P3 agent listening on :${PORT}`);
  emitEvent("P3 Agent", "started", "event-bus", `port=${PORT}`, undefined, "info");
  loadAgentConnections().catch((err) => console.warn("Connection load failed:", err));
});
