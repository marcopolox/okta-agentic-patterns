import express from "express";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { SignJWT, importJWK } from "jose";
import { randomUUID } from "crypto";

const PORT = parseInt(process.env.PORT ?? "3400");
const EVENT_BUS_URL = process.env.EVENT_BUS_URL ?? "http://localhost:4000";
const OKTA_DOMAIN = process.env.OKTA_DOMAIN ?? "";
const OKTA_AI_AGENT_ID = process.env.OKTA_AI_AGENT_ID ?? "";
const OKTA_PRIVATE_KEY = process.env.OKTA_PRIVATE_KEY ?? "";
const GITHUB_STS_RESOURCE = process.env.GITHUB_STS_RESOURCE ?? "";
const SLACK_STS_RESOURCE = process.env.SLACK_STS_RESOURCE ?? "";
const PATTERN_ID = "p4";

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

async function makeClientAssertion(audience?: string): Promise<string> {
  const jwk = JSON.parse(OKTA_PRIVATE_KEY);
  const key = await importJWK(jwk, "RS256");
  const aud = audience ?? `https://${OKTA_DOMAIN}/oauth2/v1/token`;
  return new SignJWT({})
    .setProtectedHeader({ alg: "RS256", kid: jwk.kid })
    .setIssuer(OKTA_AI_AGENT_ID)
    .setSubject(OKTA_AI_AGENT_ID)
    .setAudience(aud)
    .setIssuedAt()
    .setExpirationTime("5m")
    .setJti(randomUUID())
    .sign(key);
}

type StsResult =
  | { kind: "token"; accessToken: string }
  | { kind: "interaction_required"; errorUri: string }
  | { kind: "error"; message: string };

async function exchangeForToken(userIdToken: string, resource: string, scope?: string): Promise<StsResult> {
  const orgTokenUrl = `https://${OKTA_DOMAIN}/oauth2/v1/token`;
  const clientAssertion = await makeClientAssertion(orgTokenUrl);
  const params = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
    requested_token_type: "urn:okta:params:oauth:token-type:oauth-sts",
    subject_token: userIdToken,
    subject_token_type: "urn:ietf:params:oauth:token-type:id_token",
    client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
    client_assertion: clientAssertion,
    resource,
  });
  if (scope) params.set("scope", scope);

  try {
    const res = await fetch(orgTokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
    });
    const body = await res.json() as Record<string, unknown>;
    console.log(`[STS ${resource.slice(-20)}] HTTP ${res.status}${res.ok ? "" : ` error=${body.error}`}`);
    if (res.ok && body.access_token) {
      return { kind: "token", accessToken: body.access_token as string };
    }
    if (body.error === "interaction_required" && body.interaction_uri) {
      return { kind: "interaction_required", errorUri: body.interaction_uri as string };
    }
    return { kind: "error", message: `${body.error}: ${body.error_description}` };
  } catch (err) {
    return { kind: "error", message: err instanceof Error ? err.message : "STS exchange failed" };
  }
}

// ── GitHub ────────────────────────────────────────────────────────────────────

async function githubFetch(path: string, token: string): Promise<unknown> {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
  return res.json();
}

const GITHUB_TOOLS = [
  {
    name: "github_list_my_repos",
    description: "List GitHub repositories for the authenticated user.",
    inputSchema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["all", "owner", "public", "private", "member"] },
        sort: { type: "string", enum: ["created", "updated", "pushed", "full_name"] },
        per_page: { type: "number" },
      },
    },
  },
  {
    name: "github_search_repos",
    description: "Search GitHub repositories by keyword or query.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        per_page: { type: "number" },
      },
      required: ["query"],
    },
  },
  {
    name: "github_get_repo",
    description: "Get details for a specific GitHub repository.",
    inputSchema: {
      type: "object",
      properties: {
        owner: { type: "string" },
        repo: { type: "string" },
      },
      required: ["owner", "repo"],
    },
  },
];

async function callGitHubTool(name: string, args: Record<string, unknown>, token: string): Promise<string> {
  await emitEvent("P4 Agent", "calling tool", "GitHub REST API", `tool=${name}`, undefined, "info");
  try {
    let data: unknown;
    if (name === "github_list_my_repos") {
      data = await githubFetch(`/user/repos?type=${args.type ?? "all"}&sort=${args.sort ?? "full_name"}&per_page=${args.per_page ?? 30}`, token);
    } else if (name === "github_search_repos") {
      data = await githubFetch(`/search/repositories?q=${encodeURIComponent(args.query as string)}&per_page=${args.per_page ?? 10}`, token);
    } else if (name === "github_get_repo") {
      data = await githubFetch(`/repos/${args.owner}/${args.repo}`, token);
    } else {
      return `Unknown tool: ${name}`;
    }
    await emitEvent("Okta STS", "GitHub token used", "GitHub REST API", `tool=${name}`, undefined, "token");
    return JSON.stringify(data, null, 2);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await emitEvent("P4 Agent", "tool error", "GitHub REST API", msg, undefined, "error");
    return `Error: ${msg}`;
  }
}

// ── Slack ─────────────────────────────────────────────────────────────────────

async function slackFetch(method: string, params: Record<string, string>, token: string): Promise<unknown> {
  const url = new URL(`https://slack.com/api/${method}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Slack API ${res.status}: ${await res.text()}`);
  const body = await res.json() as Record<string, unknown>;
  if (!body.ok) throw new Error(`Slack API error: ${body.error}`);
  return body;
}

async function slackPost(method: string, params: Record<string, unknown>, token: string): Promise<unknown> {
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(`Slack API ${res.status}: ${await res.text()}`);
  const body = await res.json() as Record<string, unknown>;
  if (!body.ok) throw new Error(`Slack API error: ${body.error}`);
  return body;
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
    name: "slack_get_channel_history",
    description: "Get recent messages from a Slack channel by channel ID.",
    inputSchema: {
      type: "object",
      properties: {
        channel: { type: "string", description: "Channel ID (e.g. C012AB3CD)" },
        limit: { type: "number", description: "Number of messages (default 10)" },
      },
      required: ["channel"],
    },
  },
  {
    name: "slack_search_messages",
    description: "Search Slack messages by keyword.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Search query" },
        count: { type: "number", description: "Number of results (default 10)" },
      },
      required: ["query"],
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

type SlackReauth = () => Promise<StsResult | null>;

async function callSlackTool(name: string, args: Record<string, unknown>, token: string, reauth?: SlackReauth): Promise<string> {
  await emitEvent("P4 Agent", "calling tool", "Slack API", `tool=${name}`, undefined, "info");

  const execute = async (t: string): Promise<string> => {
    let data: unknown;
    if (name === "slack_list_channels") {
      data = await slackFetch("conversations.list", { limit: String(args.limit ?? 20), exclude_archived: "true" }, t);
    } else if (name === "slack_get_channel_history") {
      data = await slackFetch("conversations.history", { channel: args.channel as string, limit: String(args.limit ?? 10) }, t);
    } else if (name === "slack_search_messages") {
      data = await slackFetch("search.messages", { query: args.query as string, count: String(args.count ?? 10) }, t);
    } else if (name === "slack_post_message") {
      data = await slackPost("chat.postMessage", { channel: args.channel as string, text: args.text as string }, t);
    } else {
      return `Unknown tool: ${name}`;
    }
    await emitEvent("Okta STS", "Slack token used", "Slack API", `tool=${name}`, undefined, "token");
    return JSON.stringify(data, null, 2);
  };

  try {
    return await execute(token);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);

    if (msg.includes("missing_scope") && reauth) {
      await emitEvent("Okta STS", "incremental consent needed", "P4 Agent", "Slack token missing write scope — requesting chat:write", undefined, "auth");
      const result = await reauth();
      if (result?.kind === "interaction_required") {
        return `Posting to Slack requires additional permissions. [Click here to re-authorize Slack via Okta](${result.errorUri})\n\nAfter authorizing, try your request again.`;
      }
      if (result?.kind === "token") {
        try {
          return await execute(result.accessToken);
        } catch (retryErr) {
          const retryMsg = retryErr instanceof Error ? retryErr.message : String(retryErr);
          if (retryMsg.includes("missing_scope")) {
            await emitEvent("Okta STS", "bot token lacks chat:write", "Slack", "scope=channels:read only — admin must update Slack app", undefined, "error");
            return `The Slack bot token issued by Okta only has \`channels:read\` scope — it cannot post messages.\n\nTo enable posting, an Okta admin must:\n1. Open the Slack app in Okta Admin → Applications\n2. Add \`chat:write\` (and \`chat:write.public\`) to the app's OAuth scopes\n3. Reinstall the Slack app in the workspace\n\nFor now I can read channels and search messages, but cannot post.`;
          }
          await emitEvent("P4 Agent", "tool error", "Slack API", retryMsg, undefined, "error");
          return `Error: ${retryMsg}`;
        }
      }
      // reauth returned null — scope param unsupported or error
      await emitEvent("Okta STS", "bot token lacks chat:write", "Slack", "scope=channels:read only — admin must update Slack app", undefined, "error");
      return `The Slack bot token issued by Okta only has \`channels:read\` scope — it cannot post messages.\n\nTo enable posting, an Okta admin must:\n1. Open the Slack app in Okta Admin → Applications\n2. Add \`chat:write\` (and \`chat:write.public\`) to the app's OAuth scopes\n3. Reinstall the Slack app in the workspace\n\nFor now I can read channels and search messages, but cannot post.`;
    }

    await emitEvent("P4 Agent", "tool error", "Slack API", msg, undefined, "error");
    return `Error: ${msg}`;
  }
}

// ── Agent loop ────────────────────────────────────────────────────────────────

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

const sessions = new Map<string, Message[]>();

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
  overrides?: LLMOverrides
): AsyncGenerator<string> {
  const messages: Message[] = [...history, { role: "user", content: userMessage }];
  const isFirstMessage = history.length === 0;
  const greetInstruction = isFirstMessage ? `Start your response by greeting ${userName} by name. ` : "";
  const services = [GITHUB_STS_RESOURCE && "GitHub", SLACK_STS_RESOURCE && "Slack"].filter(Boolean).join(" and ");
  const system = `${greetInstruction}You are a helpful assistant that can access ${services} on behalf of ${userName} via Okta STS token exchange. Use the available tools to answer questions. Be concise. Format lists as markdown tables or structured lists.`;

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
  res.json({ ok: true, service: "p4-agent" });
});

app.get("/status", (_req, res) => {
  const servers = [
    GITHUB_STS_RESOURCE && { label: "GitHub", connectionType: "STS", active: true },
    SLACK_STS_RESOURCE  && { label: "Slack",  connectionType: "STS", active: true },
  ].filter(Boolean);
  res.json({
    state: "ready",
    servers,
    message: `${servers.length} STS resource(s) configured`,
  });
});

app.post("/revoke", async (req, res) => {
  const authHeader = req.headers.authorization;
  const userIdToken = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!userIdToken) {
    res.status(401).json({ ok: false, error: "missing id_token" });
    return;
  }

  const slackResult = await exchangeForToken(userIdToken, SLACK_STS_RESOURCE);
  if (slackResult.kind !== "token") {
    res.status(400).json({ ok: false, error: slackResult.kind === "error" ? slackResult.message : "interaction_required" });
    return;
  }

  const orgTokenUrl = `https://${OKTA_DOMAIN}/oauth2/v1/revoke`;
  const clientAssertion = await makeClientAssertion(orgTokenUrl);
  const revokeRes = await fetch(orgTokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      token: slackResult.accessToken,
      token_type_hint: "oauth_sts",
      client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
      client_assertion: clientAssertion,
    }).toString(),
  });

  await emitEvent("Console", "revoked STS token", "Okta", "Slack STS token removed from vault", undefined, "auth");
  res.json({ ok: revokeRes.ok, status: revokeRes.status });
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
    await emitEvent("P4 Agent", "rejected request", "chat", "missing user ID token", undefined, "error");
    res.status(401).json({ error: "User ID token required — log in first" });
    return;
  }

  const sid = session_id ?? "default";
  const history = sessions.get(sid) ?? [];
  const claims = decodeJwtPayload(userIdToken);
  const userName = (claims.name ?? claims.email ?? "User") as string;

  await emitEvent("P4 Agent", "user id_token received", "Okta", `user=${userName}`, undefined, "token", userIdToken);

  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Transfer-Encoding", "chunked");

  try {
    const tokens: { github?: string; slack?: string } = {};
    const tools: ToolDef[] = [];

    // Detect which services the user is asking about
    const lower = message.toLowerCase();
    const wantsGitHub = /github|repo|repository|pull request|\bpr\b|commit|branch/.test(lower);
    const wantsSlack = /slack|channel|workspace/.test(lower);
    const wantsBoth = !wantsGitHub && !wantsSlack; // no explicit mention → try both

    // Exchange tokens only for relevant services
    const exchanges: Array<{ name: string; resource: string; key: keyof typeof tokens }> = [];
    if (GITHUB_STS_RESOURCE && (wantsGitHub || wantsBoth)) exchanges.push({ name: "GitHub", resource: GITHUB_STS_RESOURCE, key: "github" });
    if (SLACK_STS_RESOURCE && (wantsSlack || wantsBoth)) exchanges.push({ name: "Slack", resource: SLACK_STS_RESOURCE, key: "slack" });

    const consentMessages: string[] = [];
    const errorMessages: string[] = [];

    for (const { name, resource, key } of exchanges) {
      await emitEvent("P4 Agent", "requesting STS token exchange", "Okta STS", `user=${userName} resource=${name}`, undefined, "auth");
      const result = await exchangeForToken(userIdToken, resource);

      if (result.kind === "interaction_required") {
        await emitEvent("Okta STS", "interaction_required", "P4 Agent", `${name} not linked to Okta`, undefined, "auth");
        consentMessages.push(
          `**${name}** — account not linked yet. [Click here to authorize ${name} → Okta](${result.errorUri})`
        );
      } else if (result.kind === "error") {
        await emitEvent("Okta STS", "token exchange failed", "P4 Agent", result.message, undefined, "error");
        errorMessages.push(`**${name}**: ${result.message}`);
      } else {
        tokens[key] = result.accessToken;
        const snippet = `${result.accessToken.slice(0, 20)}…`;
        await emitEvent("Okta STS", `${name} token obtained`, "P4 Agent", `user=${userName}`, snippet, "token", result.accessToken);
      }
    }

    if (tokens.github) tools.push(...GITHUB_TOOLS);
    if (tokens.slack) tools.push(...SLACK_TOOLS);

    // If no tokens obtained at all, surface consent/error messages
    if (tools.length === 0) {
      const lines: string[] = [];
      if (consentMessages.length) {
        lines.push("To get started, please link your accounts with Okta:\n");
        lines.push(...consentMessages.map((m) => `- ${m}`));
        lines.push("\nAfter authorizing, return here and repeat your question.");
      }
      if (errorMessages.length) {
        lines.push("\nThe following services encountered errors:");
        lines.push(...errorMessages.map((m) => `- ${m}`));
      }
      res.write(lines.join("\n"));
      res.end();
      return;
    }

    // If some resources need consent, prepend a note but continue with available tools
    if (consentMessages.length) {
      res.write("⚠️ Some accounts need to be linked with Okta:\n");
      consentMessages.forEach((m) => res.write(`- ${m}\n`));
      res.write("\nI'll answer using the accounts that are already linked:\n\n");
    }

    const callTool: ToolExecutor = (name, args) => {
      if (name.startsWith("github_") && tokens.github) return callGitHubTool(name, args, tokens.github);
      if (name.startsWith("slack_") && tokens.slack) {
        const reauthSlack: SlackReauth = async () => {
          const result = await exchangeForToken(userIdToken, SLACK_STS_RESOURCE, "chat:write");
          if (result.kind === "token") {
            tokens.slack = result.accessToken;
            const snippet = `${result.accessToken.slice(0, 20)}…`;
            await emitEvent("Okta STS", "Slack token refreshed", "P4 Agent", `user=${userName} scope=chat:write`, snippet, "token", result.accessToken);
          }
          return result.kind !== "error" ? result : null;
        };
        return callSlackTool(name, args, tokens.slack, reauthSlack);
      }
      return Promise.resolve(`No token available for tool: ${name}`);
    };

    let fullResponse = "";
    for await (const chunk of runAgentLoop(message, history, callTool, tools, userName, llmOverrides)) {
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
  console.log(`P4 agent listening on :${PORT}`);
  emitEvent("P4 Agent", "started", "event-bus", `port=${PORT}`, undefined, "info");
});
