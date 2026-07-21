import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { z } from "zod";
import { HR_THEMES } from "./industries/index.js";

const PORT = parseInt(process.env.PORT ?? "3101");
const EVENT_BUS_URL = process.env.EVENT_BUS_URL ?? "http://localhost:4000";
const OKTA_ISSUER = process.env.OKTA_ISSUER ?? "";
const OKTA_AUDIENCE = process.env.OKTA_AUDIENCE ?? "api://hr-resource";
const PATTERN_IDS = (process.env.PATTERN_IDS ?? process.env.PATTERN_ID ?? "unknown")
  .split(",").map((s) => s.trim()).filter(Boolean);

let currentThemeId = process.env.DEMO_THEME ?? "default";

function getData() {
  return HR_THEMES[currentThemeId as keyof typeof HR_THEMES] ?? HR_THEMES.default;
}

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
    console.error(`[HR] token validation failed: ${msg} | token.aud=${JSON.stringify(decodedAud)} token.iss=${decodedIss} token.kid=${decodedKid} | expected iss=${OKTA_ISSUER} aud=${OKTA_AUDIENCE}`);
    throw err;
  }

  const snippet = token.slice(0, 12) + "..." + token.slice(-8);
  const sub = String(payload.sub ?? "unknown");
  const act = payload.act as { sub?: string } | undefined;
  const detail = act?.sub ? `user=${sub} agent=${act.sub}` : `sub=${sub}`;

  if (!recentlyValidated.has(snippet)) {
    recentlyValidated.add(snippet);
    setTimeout(() => recentlyValidated.delete(snippet), 10000);
    await emitEvent("HR Server", "validated token", "Okta JWKS", detail, snippet, "token", scopePatternIds);
  }

  return { sub, act: act?.sub ? { sub: act.sub } : undefined };
}

const PUBLIC_TOOLS = new Set(["get_headcount"]);

function createMcpServer(patternIds: string[]) {
  const server = new McpServer({ name: "hr-resource-server", version: "1.0.0" });

  server.tool("get_headcount", "Get total employee count by department. No authentication required.", {},
    async () => {
      await emitEvent("HR Server", "called tool", "get_headcount", "unauthenticated", undefined, "info", patternIds);
      const counts = getData().departments.map((d) => ({ department: d.name, headCount: d.headcount }));
      return { content: [{ type: "text", text: JSON.stringify(counts, null, 2) }] };
    }
  );

  server.tool("list_employees", "List all employees. Optionally filter by department.",
    { department: z.string().optional().describe("Filter by department name") },
    async ({ department }) => {
      await emitEvent("HR Server", "called tool", "list_employees", department ? `dept=${department}` : undefined, undefined, "info", patternIds);
      const result = department
        ? getData().employees.filter((e) => e.department.toLowerCase() === department.toLowerCase())
        : getData().employees;
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool("get_employee", "Get details for a specific employee by ID.",
    { employee_id: z.string().describe("Employee ID (e.g. e001)") },
    async ({ employee_id }) => {
      await emitEvent("HR Server", "called tool", "get_employee", `id=${employee_id}`, undefined, "info", patternIds);
      const emp = getData().employees.find((e) => e.id === employee_id);
      if (!emp) return { content: [{ type: "text", text: `Employee ${employee_id} not found` }] };
      return { content: [{ type: "text", text: JSON.stringify(emp, null, 2) }] };
    }
  );

  server.tool("get_org_chart", "Get the organizational reporting hierarchy.", {},
    async () => {
      await emitEvent("HR Server", "called tool", "get_org_chart", undefined, undefined, "info", patternIds);
      const { employees } = getData();
      const chart = employees.map((e) => ({
        id: e.id, name: e.name, title: e.title,
        reportsTo: e.manager ? employees.find((m) => m.id === e.manager)?.name ?? null : null,
      }));
      return { content: [{ type: "text", text: JSON.stringify(chart, null, 2) }] };
    }
  );

  server.tool("list_departments", "List all departments with headcount.", {},
    async () => {
      await emitEvent("HR Server", "called tool", "list_departments", undefined, undefined, "info", patternIds);
      const { employees, departments } = getData();
      const result = departments.map((d) => ({
        ...d, head: employees.find((e) => e.id === d.head)?.name ?? d.head,
      }));
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool("search_employees", "Search employees by name or title.",
    { query: z.string().describe("Search query") },
    async ({ query }) => {
      await emitEvent("HR Server", "called tool", "search_employees", `q=${query}`, undefined, "info", patternIds);
      const q = query.toLowerCase();
      const result = getData().employees.filter(
        (e) => e.name.toLowerCase().includes(q) || e.title.toLowerCase().includes(q)
      );
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool("update_employee_title", "Update an employee's job title.",
    {
      employee_id: z.string().describe("Employee ID (e.g. e001)"),
      new_title: z.string().describe("New job title"),
    },
    async ({ employee_id, new_title }) => {
      await emitEvent("HR Server", "called tool", "update_employee_title", `id=${employee_id} title=${new_title}`, undefined, "info", patternIds);
      const emp = getData().employees.find((e) => e.id === employee_id);
      if (!emp) return { content: [{ type: "text", text: `Employee ${employee_id} not found` }] };
      const oldTitle = emp.title;
      emp.title = new_title;
      return { content: [{ type: "text", text: `Updated ${emp.name}: "${oldTitle}" → "${new_title}"` }] };
    }
  );

  return server;
}

const app = express();
app.use(express.json());

const TOOL_DEFINITIONS = [
  {
    name: "get_headcount",
    description: "Get total employee count by department. No authentication required.",
    requiredScopes: [],
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "list_employees",
    description: "List all employees. Optionally filter by department.",
    requiredScopes: ["hr:read"],
    inputSchema: {
      type: "object",
      properties: { department: { type: "string", description: "Filter by department name" } },
    },
  },
  {
    name: "get_employee",
    description: "Get details for a specific employee by ID.",
    requiredScopes: ["hr:read"],
    inputSchema: {
      type: "object",
      properties: { employee_id: { type: "string", description: "Employee ID (e.g. e001)" } },
      required: ["employee_id"],
    },
  },
  {
    name: "get_org_chart",
    description: "Get the organizational reporting hierarchy.",
    requiredScopes: ["hr:read"],
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "list_departments",
    description: "List all departments with headcount.",
    requiredScopes: ["hr:read"],
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "search_employees",
    description: "Search employees by name or title.",
    requiredScopes: ["hr:read"],
    inputSchema: {
      type: "object",
      properties: { query: { type: "string", description: "Search query" } },
      required: ["query"],
    },
  },
  {
    name: "update_employee_title",
    description: "Update an employee's job title.",
    requiredScopes: ["hr:write"],
    inputSchema: {
      type: "object",
      properties: {
        employee_id: { type: "string", description: "Employee ID (e.g. e001)" },
        new_title: { type: "string", description: "New job title" },
      },
      required: ["employee_id", "new_title"],
    },
  },
];

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "hr-resource-server", patternIds: PATTERN_IDS });
});

app.get("/tools", (_req, res) => {
  res.json({ protocol: "mcp", version: "1.0.0", tools: TOOL_DEFINITIONS });
});

app.get("/.well-known/oauth-protected-resource", (_req, res) => {
  res.json({
    resource: OKTA_AUDIENCE,
    authorization_servers: [OKTA_ISSUER],
    scopes_supported: ["hr:read", "hr:write", "hr:delete"],
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
    scopes_supported: ["hr:read", "hr:write", "hr:delete"],
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
        await emitEvent("HR Server", "rejected request", "client", msg, undefined, "error", emitPatterns);
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
  if (themeId && HR_THEMES[themeId as keyof typeof HR_THEMES]) {
    currentThemeId = themeId;
    console.log(`[HR] theme switched to: ${currentThemeId}`);
    emitEvent("HR Server", "theme switched", themeId, undefined, undefined, "info");
    res.json({ ok: true, themeId: currentThemeId });
  } else {
    res.status(400).json({ error: `Unknown theme: ${themeId}` });
  }
});

app.listen(PORT, () => {
  console.log(`HR MCP resource server listening on :${PORT} (patterns=${PATTERN_IDS.join(",")})`);
  emitEvent("HR Server", "started", "event-bus", `port=${PORT}`, undefined, "info");
});
