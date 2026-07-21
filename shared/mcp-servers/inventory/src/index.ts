import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { z } from "zod";
import { INVENTORY_THEMES } from "./industries";

const PORT = parseInt(process.env.PORT ?? "3103");
const EVENT_BUS_URL = process.env.EVENT_BUS_URL ?? "http://localhost:4000";
const OKTA_ISSUER = process.env.OKTA_ISSUER ?? "";
const OKTA_AUDIENCE = process.env.OKTA_AUDIENCE ?? "api://inventory-resource";
const PATTERN_IDS = (process.env.PATTERN_IDS ?? process.env.PATTERN_ID ?? "unknown")
  .split(",").map((s) => s.trim()).filter(Boolean);

let currentThemeId = process.env.DEMO_THEME ?? "default";

function getData() {
  return INVENTORY_THEMES[currentThemeId as keyof typeof INVENTORY_THEMES] ?? INVENTORY_THEMES.default;
}

const PUBLIC_TOOLS = new Set(["get_product_catalog"]);

const JWKS = createRemoteJWKSet(new URL(`${OKTA_ISSUER}/v1/keys`));
const recentlyValidated = new Set<string>();

async function emitEvent(actor: string, action: string, target: string, detail?: string, tokenSnippet?: string, level = "auth") {
  try {
    await Promise.all(PATTERN_IDS.map((patternId) =>
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

async function validateToken(authHeader: string | undefined): Promise<TokenClaims> {
  if (!authHeader?.startsWith("Bearer ")) {
    throw new Error("Missing or invalid Authorization header");
  }
  const token = authHeader.slice(7);

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
  } catch { /* ignore */ }

  let payload: Awaited<ReturnType<typeof jwtVerify>>["payload"];
  try {
    ({ payload } = await jwtVerify(token, JWKS, {
      issuer: OKTA_ISSUER,
      audience: OKTA_AUDIENCE,
    }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Inventory] token validation failed: ${msg} | token.aud=${JSON.stringify(decodedAud)} token.iss=${decodedIss} token.kid=${decodedKid} | expected iss=${OKTA_ISSUER} aud=${OKTA_AUDIENCE}`);
    throw err;
  }

  const snippet = token.slice(0, 12) + "..." + token.slice(-8);
  const sub = String(payload.sub ?? "unknown");
  const act = payload.act as { sub?: string } | undefined;
  const detail = act?.sub ? `user=${sub} agent=${act.sub}` : `sub=${sub}`;

  if (!recentlyValidated.has(snippet)) {
    recentlyValidated.add(snippet);
    setTimeout(() => recentlyValidated.delete(snippet), 10000);
    await emitEvent("Inventory Server", "validated token", "Okta JWKS", detail, snippet, "token");
  }

  return { sub, act: act?.sub ? { sub: act.sub } : undefined };
}

function stockStatus(inStock: number, reorderPoint: number): string {
  if (inStock === 0) return "out_of_stock";
  if (inStock <= reorderPoint) return "low_stock";
  return "in_stock";
}

function createMcpServer() {
  const server = new McpServer({ name: "inventory-resource-server", version: "1.0.0" });

  server.tool(
    "get_product_catalog",
    "Browse the product catalog. No authentication required.",
    { category: z.string().optional().describe("Filter by category") },
    async ({ category }) => {
      await emitEvent("Inventory Server", "called tool", "get_product_catalog", category ? `category=${category}` : "all", undefined, "info");
      const result = category
        ? getData().products.filter((p) => p.category.toLowerCase() === category.toLowerCase())
        : getData().products;
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "check_stock",
    "Check stock availability for a product SKU.",
    { sku: z.string().describe("Product SKU") },
    async ({ sku }) => {
      await emitEvent("Inventory Server", "called tool", "check_stock", `sku=${sku}`, undefined, "info");
      const inv = getData().inventory.find((i) => i.sku.toLowerCase() === sku.toLowerCase());
      if (!inv) return { content: [{ type: "text", text: `SKU ${sku} not found` }] };
      const available = inv.inStock - inv.reserved;
      const result = { ...inv, available, status: stockStatus(inv.inStock, inv.reorderPoint) };
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "get_product_details",
    "Get full product information including live stock level.",
    { sku: z.string().describe("Product SKU") },
    async ({ sku }) => {
      await emitEvent("Inventory Server", "called tool", "get_product_details", `sku=${sku}`, undefined, "info");
      const { products, inventory } = getData();
      const product = products.find((p) => p.sku.toLowerCase() === sku.toLowerCase());
      if (!product) return { content: [{ type: "text", text: `Product ${sku} not found` }] };
      const inv = inventory.find((i) => i.sku.toLowerCase() === sku.toLowerCase());
      const result = {
        ...product,
        stock: inv
          ? { inStock: inv.inStock, reserved: inv.reserved, available: inv.inStock - inv.reserved, warehouse: inv.warehouse, status: stockStatus(inv.inStock, inv.reorderPoint) }
          : null,
      };
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "get_order_status",
    "Get the status of an order by order ID.",
    { order_id: z.string().describe("Order ID") },
    async ({ order_id }) => {
      await emitEvent("Inventory Server", "called tool", "get_order_status", `id=${order_id}`, undefined, "info");
      const order = getData().orders.find((o) => o.id.toLowerCase() === order_id.toLowerCase());
      if (!order) return { content: [{ type: "text", text: `Order ${order_id} not found` }] };
      return { content: [{ type: "text", text: JSON.stringify(order, null, 2) }] };
    }
  );

  server.tool(
    "list_categories",
    "List all product categories with product counts.",
    {},
    async () => {
      await emitEvent("Inventory Server", "called tool", "list_categories", undefined, undefined, "info");
      const { categories, products } = getData();
      const result = categories.map((cat) => ({
        category: cat,
        productCount: products.filter((p) => p.category === cat).length,
      }));
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    }
  );

  server.tool(
    "update_stock",
    "Add units to the inventory for a product SKU. Requires inventory:write scope.",
    {
      sku: z.string().describe("Product SKU"),
      quantity_to_add: z.number().int().positive().describe("Units to add"),
      reason: z.string().optional().describe("Reason for the update"),
    },
    async ({ sku, quantity_to_add, reason }) => {
      const inv = getData().inventory.find((i) => i.sku.toLowerCase() === sku.toLowerCase());
      if (!inv) return { content: [{ type: "text", text: `SKU ${sku} not found` }] };
      const before = inv.inStock;
      inv.inStock += quantity_to_add;
      await emitEvent("Inventory Server", "updated stock", `sku=${sku}`,
        `${before} → ${inv.inStock}${reason ? ` (${reason})` : ""}`, undefined, "info");
      return { content: [{ type: "text", text: JSON.stringify({ sku, before, after: inv.inStock, quantity_added: quantity_to_add }) }] };
    }
  );

  return server;
}

const app = express();
app.use(express.json());

const TOOL_DEFINITIONS = [
  {
    name: "get_product_catalog",
    description: "Browse the product catalog. No authentication required.",
    requiredScopes: [],
    inputSchema: {
      type: "object",
      properties: { category: { type: "string", description: "Filter by category" } },
    },
  },
  {
    name: "check_stock",
    description: "Check stock availability for a product SKU.",
    requiredScopes: ["inventory:read"],
    inputSchema: {
      type: "object",
      properties: { sku: { type: "string", description: "Product SKU (e.g. WPH-X3-BLK)" } },
      required: ["sku"],
    },
  },
  {
    name: "get_product_details",
    description: "Get full product information including live stock level.",
    requiredScopes: ["inventory:read"],
    inputSchema: {
      type: "object",
      properties: { sku: { type: "string", description: "Product SKU (e.g. WPH-X3-BLK)" } },
      required: ["sku"],
    },
  },
  {
    name: "get_order_status",
    description: "Get the status of an order by order ID.",
    requiredScopes: ["inventory:read"],
    inputSchema: {
      type: "object",
      properties: { order_id: { type: "string", description: "Order ID (e.g. ORD-10041)" } },
      required: ["order_id"],
    },
  },
  {
    name: "list_categories",
    description: "List all product categories with product counts.",
    requiredScopes: ["inventory:read"],
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "update_stock",
    description: "Add units to the inventory for a product SKU. Requires inventory:write scope.",
    requiredScopes: ["inventory:write"],
    inputSchema: {
      type: "object",
      properties: {
        sku: { type: "string", description: "Product SKU (e.g. WPH-X3-BLK)" },
        quantity_to_add: { type: "number", description: "Units to add" },
        reason: { type: "string", description: "Reason for the update" },
      },
      required: ["sku", "quantity_to_add"],
    },
  },
];

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "inventory-resource-server", patternIds: PATTERN_IDS });
});

app.get("/tools", (_req, res) => {
  res.json({ protocol: "mcp", version: "1.0.0", tools: TOOL_DEFINITIONS });
});

app.get("/.well-known/oauth-protected-resource", (_req, res) => {
  res.json({
    resource: OKTA_AUDIENCE,
    authorization_servers: [OKTA_ISSUER],
    scopes_supported: ["inventory:read", "inventory:write"],
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
    scopes_supported: ["inventory:read", "inventory:write"],
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
  });
});

app.all("/mcp", async (req, res) => {
  const method = req.body?.method as string | undefined;
  // Only require auth for tool calls to non-public tools; everything else (initialize, notifications, tools/list) passes through
  const isProtectedToolCall = method === "tools/call" && !PUBLIC_TOOLS.has(req.body?.params?.name);
  if (isProtectedToolCall) {
    try {
      await validateToken(req.headers.authorization);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unauthorized";
      await emitEvent("Inventory Server", "rejected request", "client", msg, undefined, "error");
      res.status(401).json({ error: msg });
      return;
    }
  }

  const server = createMcpServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });

  res.on("close", () => transport.close());
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.post("/set-theme", (req, res) => {
  const { themeId } = req.body ?? {};
  if (themeId && INVENTORY_THEMES[themeId as keyof typeof INVENTORY_THEMES]) {
    currentThemeId = themeId;
    console.log(`[Inventory] theme switched to: ${currentThemeId}`);
    emitEvent("Inventory Server", "theme switched", themeId, undefined, undefined, "info");
    res.json({ ok: true, themeId: currentThemeId });
  } else {
    res.status(400).json({ error: `Unknown theme: ${themeId}` });
  }
});

app.listen(PORT, () => {
  console.log(`Inventory MCP resource server listening on :${PORT} (patterns=${PATTERN_IDS.join(",")})`);
  emitEvent("Inventory Server", "started", "event-bus", `port=${PORT}`, undefined, "info");
});
