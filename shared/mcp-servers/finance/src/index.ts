import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { z } from "zod";
import { FINANCE_THEMES } from "./industries/index.js";

const PORT = parseInt(process.env.PORT ?? "3102");
const EVENT_BUS_URL = process.env.EVENT_BUS_URL ?? "http://localhost:4000";
const OKTA_ISSUER = process.env.OKTA_ISSUER ?? "";
const OKTA_AUDIENCE = process.env.OKTA_AUDIENCE ?? "api://finance-resource";
const PATTERN_IDS = (process.env.PATTERN_IDS ?? process.env.PATTERN_ID ?? "unknown")
  .split(",").map((s) => s.trim()).filter(Boolean);

let currentThemeId = process.env.DEMO_THEME ?? "default";

function getData() {
  const raw = FINANCE_THEMES[currentThemeId as keyof typeof FINANCE_THEMES] ?? FINANCE_THEMES.default;
  return {
    budgets: raw.budgets.map((b) => ({
      ...b,
      total: b.allocated,
      year: b.fiscalYear,
      remaining: b.allocated - b.spent,
    })),
    invoices: raw.invoices,
    costCenters: raw.costCenters.map((cc) => ({
      ...cc,
      owner: cc.manager,
      annualBudget: cc.budget,
    })),
  };
}

const PUBLIC_TOOLS = new Set(["get_fiscal_summary"]);

const JWKS = createRemoteJWKSet(new URL(`${OKTA_ISSUER}/v1/keys`));
const recentlyValidated = new Set<string>();

async function emitEvent(actor: string, action: string, target: string, detail?: string, tokenSnippet?: string, level = "auth", scopePatternIds?: string[]) {
  const targets = scopePatternIds ?? PATTERN_IDS;
  try {
    await Promise.all(targets.map((patternId) =>
      fetch(`${EVENT_BUS_URL}/emit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patternId, actor, action, target, detail, tokenSnippet, level }),
      })
    ));
  } catch {
    // Non-fatal
  }
}

interface TokenClaims {
  sub: string;
  act?: { sub: string };
}

async function validateToken(authHeader: string | undefined, scopePatternIds?: string[]): Promise<TokenClaims> {
  if (!authHeader?.startsWith("Bearer ")) {
    throw new Error("Missing or invalid Authorization header");
  }
  const token = authHeader.slice(7);

  // Decode header+payload without verification to log diagnostic info on failure
  let decodedAud: unknown;
  let decodedIss: unknown;
  let decodedKid: unknown;
  try {
    const parts = token.split(".");
    if (parts.length === 3) {
      const header = JSON.parse(Buffer.from(parts[0], "base64url").toString());
      const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString());
      decodedAud = payload.aud;
      decodedIss = payload.iss;
      decodedKid = header.kid;
    }
  } catch { /* ignore decode errors */ }

  let payload: Awaited<ReturnType<typeof jwtVerify>>["payload"];
  try {
    ({ payload } = await jwtVerify(token, JWKS, {
      issuer: OKTA_ISSUER,
      audience: OKTA_AUDIENCE,
    }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Finance] token validation failed: ${msg} | token.aud=${JSON.stringify(decodedAud)} token.iss=${decodedIss} token.kid=${decodedKid} | expected iss=${OKTA_ISSUER} aud=${OKTA_AUDIENCE}`);
    throw err;
  }

  const snippet = token.slice(0, 12) + "..." + token.slice(-8);
  const sub = String(payload.sub ?? "unknown");
  const act = payload.act as { sub?: string } | undefined;
  const detail = act?.sub ? `user=${sub} agent=${act.sub}` : `sub=${sub}`;

  if (!recentlyValidated.has(snippet)) {
    recentlyValidated.add(snippet);
    setTimeout(() => recentlyValidated.delete(snippet), 10000);
    await emitEvent("Finance Server", "validated token", "Okta JWKS", detail, snippet, "token", scopePatternIds);
  }

  return { sub, act: act?.sub ? { sub: act.sub } : undefined };
}

function createMcpServer(patternIds: string[]) {
  const server = new McpServer({ name: "finance-resource-server", version: "1.0.0" });

  server.tool("get_fiscal_summary", "Get high-level fiscal summary (total budget vs spend). No authentication required.", {},
    async () => {
      await emitEvent("Finance Server", "called tool", "get_fiscal_summary", "unauthenticated", undefined, "info", patternIds);
      const { budgets } = getData();
      const totalBudget = budgets.reduce((s, b) => s + b.total, 0);
      const totalSpent = budgets.reduce((s, b) => s + b.spent, 0);
      const summary = { totalBudget, totalSpent, remaining: totalBudget - totalSpent, utilizationPct: Math.round((totalSpent / totalBudget) * 100) };
      return { content: [{ type: "text", text: JSON.stringify(summary, null, 2) }] };
    }
  );

  server.tool("get_budget", "Get budget for a department.",
    { department: z.string().describe("Department name") },
    async ({ department }) => {
      await emitEvent("Finance Server", "called tool", "get_budget", `dept=${department}`, undefined, "info", patternIds);
      const budget = getData().budgets.find((b) => b.department.toLowerCase() === department.toLowerCase());
      if (!budget) return { content: [{ type: "text", text: `No budget found for ${department}` }] };
      return { content: [{ type: "text", text: JSON.stringify(budget, null, 2) }] };
    }
  );

  server.tool("list_invoices", "List invoices. Optionally filter by status.",
    {
      status: z.enum(["paid", "pending", "all"]).optional().describe("Filter by payment status"),
    },
    async ({ status }) => {
      await emitEvent("Finance Server", "called tool", "list_invoices", `status=${status ?? "all"}`, undefined, "info", patternIds);
      let result = getData().invoices;
      if (status && status !== "all") result = result.filter((i) => i.status === status);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool("get_expense_report", "Get a summary expense report across all departments.",
    { year: z.number().optional().describe("Fiscal year (default 2025)") },
    async ({ year = 2025 }) => {
      await emitEvent("Finance Server", "called tool", "get_expense_report", `year=${year}`, undefined, "info", patternIds);
      const filtered = getData().budgets.filter((b) => b.fiscalYear === String(year));
      const total = filtered.reduce((s, b) => s + b.total, 0);
      const spent = filtered.reduce((s, b) => s + b.spent, 0);
      const report = { year, totalBudget: total, totalSpent: spent, remaining: total - spent, utilizationPct: Math.round((spent / total) * 100), byDepartment: filtered };
      return { content: [{ type: "text", text: JSON.stringify(report, null, 2) }] };
    }
  );

  server.tool("list_cost_centers", "List all cost centers with YTD spend.", {},
    async () => {
      await emitEvent("Finance Server", "called tool", "list_cost_centers", undefined, undefined, "info", patternIds);
      return { content: [{ type: "text", text: JSON.stringify(getData().costCenters, null, 2) }] };
    }
  );

  server.tool("get_invoice", "Get details for a specific invoice by ID.",
    { invoice_id: z.string().describe("Invoice ID (e.g. inv-001)") },
    async ({ invoice_id }) => {
      await emitEvent("Finance Server", "called tool", "get_invoice", `id=${invoice_id}`, undefined, "info", patternIds);
      const inv = getData().invoices.find((i) => i.id === invoice_id);
      if (!inv) return { content: [{ type: "text", text: `Invoice ${invoice_id} not found` }] };
      return { content: [{ type: "text", text: JSON.stringify(inv, null, 2) }] };
    }
  );

  return server;
}

const app = express();
app.use(express.json());

const TOOL_DEFINITIONS = [
  {
    name: "get_fiscal_summary",
    description: "Get high-level fiscal summary (total budget vs spend). No authentication required.",
    requiredScopes: [],
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_budget",
    description: "Get budget for a department.",
    requiredScopes: ["finance:read"],
    inputSchema: {
      type: "object",
      properties: { department: { type: "string", description: "Department name" } },
      required: ["department"],
    },
  },
  {
    name: "list_invoices",
    description: "List invoices. Optionally filter by status or department.",
    requiredScopes: ["finance:read"],
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["paid", "pending", "all"], description: "Filter by payment status" },
        department: { type: "string", description: "Filter by department" },
      },
    },
  },
  {
    name: "get_expense_report",
    description: "Get a summary expense report across all departments.",
    requiredScopes: ["finance:read"],
    inputSchema: {
      type: "object",
      properties: { year: { type: "number", description: "Fiscal year (default 2025)" } },
    },
  },
  {
    name: "list_cost_centers",
    description: "List all cost centers with YTD spend.",
    requiredScopes: ["finance:read"],
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_invoice",
    description: "Get details for a specific invoice by ID.",
    requiredScopes: ["finance:read"],
    inputSchema: {
      type: "object",
      properties: { invoice_id: { type: "string", description: "Invoice ID (e.g. inv-001)" } },
      required: ["invoice_id"],
    },
  },
];

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "finance-resource-server", patternIds: PATTERN_IDS });
});

app.get("/tools", (_req, res) => {
  res.json({ protocol: "mcp", version: "1.0.0", tools: TOOL_DEFINITIONS });
});

app.get("/.well-known/oauth-protected-resource", (_req, res) => {
  res.json({
    resource: OKTA_AUDIENCE,
    authorization_servers: [OKTA_ISSUER],
    scopes_supported: ["finance:read", "finance:write", "finance:approve"],
    bearer_methods_supported: ["header"],
  });
});

app.get("/.well-known/oauth-authorization-server", (req, res) => {
  const serverUrl = `${req.protocol}://${req.get("host")}`;
  res.json({
    issuer: serverUrl,
    authorization_endpoint: `${OKTA_ISSUER}/v1/authorize`,
    token_endpoint: `${OKTA_ISSUER}/v1/token`,
    jwks_uri: `${OKTA_ISSUER}/v1/keys`,
    scopes_supported: ["finance:read", "finance:write", "finance:approve"],
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
  });
});

app.all("/mcp", async (req, res) => {
  const xPatternId = typeof req.headers["x-pattern-id"] === "string" ? req.headers["x-pattern-id"] : null;
  const emitPatterns = xPatternId && PATTERN_IDS.includes(xPatternId) ? [xPatternId] : undefined;

  const isPublicTool = req.body?.method === "tools/call" && PUBLIC_TOOLS.has(req.body?.params?.name);
  if (!isPublicTool) {
    try {
      await validateToken(req.headers.authorization, emitPatterns);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unauthorized";
      if (req.headers.authorization) {
        await emitEvent("Finance Server", "rejected request", "client", msg, undefined, "error", emitPatterns);
      }
      res.status(401).json({ error: msg });
      return;
    }
  }

  const server = createMcpServer(emitPatterns ?? PATTERN_IDS);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

  res.on("close", () => transport.close());
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.post("/set-theme", (req, res) => {
  const { themeId } = req.body ?? {};
  if (themeId && FINANCE_THEMES[themeId as keyof typeof FINANCE_THEMES]) {
    currentThemeId = themeId;
    console.log(`[Finance] theme switched to: ${currentThemeId}`);
    emitEvent("Finance Server", "theme switched", themeId, undefined, undefined, "info");
    res.json({ ok: true, themeId: currentThemeId });
  } else {
    res.status(400).json({ error: `Unknown theme: ${themeId}` });
  }
});

app.listen(PORT, () => {
  console.log(`Finance MCP resource server listening on :${PORT} (patterns=${PATTERN_IDS.join(",")})`);
  emitEvent("Finance Server", "started", "event-bus", `port=${PORT}`, undefined, "info");
});
