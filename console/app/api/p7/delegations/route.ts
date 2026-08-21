import { NextRequest, NextResponse } from "next/server";
import { OpenFgaClient, CredentialsMethod, ConsistencyPreference } from "@openfga/sdk";

async function emitFgaEvent(tool: string, action: "granted" | "revoked", user: string, sessionId?: string) {
  const eventBusUrl = process.env.EVENT_BUS_URL ?? "http://event-bus:4000";
  try {
    await fetch(`${eventBusUrl}/emit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patternId: "p7",
        actor: "User",
        action: action === "granted" ? "FGA grant" : "FGA revoke",
        target: "Okta FGA",
        detail: `${action} tool:${tool} for user:${user}`,
        level: "auth",
        sessionId,
      }),
    });
  } catch {
    // Non-fatal: event bus may not be running
  }
}

function makeFgaClient(): OpenFgaClient {
  const apiUrl = (process.env.OKTA_FGA_API_URL ?? "https://api.us1.fga.dev").replace(/\/$/, "");
  return new OpenFgaClient({
    apiUrl,
    storeId: process.env.OKTA_FGA_STORE_ID ?? "",
    authorizationModelId: process.env.OKTA_FGA_AUTHORIZATION_MODEL_ID || undefined,
    credentials: {
      method: CredentialsMethod.ClientCredentials,
      config: {
        clientId: process.env.OKTA_FGA_CLIENT_ID ?? "",
        clientSecret: process.env.OKTA_FGA_CLIENT_SECRET ?? "",
        apiTokenIssuer: "auth.fga.dev",
        apiAudience: "https://api.us1.fga.dev/",
      },
    },
  });
}

// This is a shared demo login, so every visitor authenticates as the same Okta
// user — without this, concurrent demo sessions would read/write the exact same
// FGA tuples and overwrite each other's delegated-tool grants. Folding the
// per-page-mount viewerSessionId into the FGA user id gives each browser session
// its own isolated set of tuples while keeping the same real identity.
function fgaUserId(email: string, viewerSessionId?: string | null): string {
  // OpenFGA rejects "::" inside a user id (validation error: "the 'user' field is malformed") —
  // double underscore is a safe separator that doesn't collide with the type:id syntax.
  return viewerSessionId ? `${email}__${viewerSessionId}` : email;
}

function getEmailFromToken(token: string): string | null {
  try {
    const payload = JSON.parse(
      Buffer.from(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")
    );
    return (payload.email ?? payload.sub ?? null) as string | null;
  } catch {
    return null;
  }
}

const ALL_TOOLS = [
  "list_employees", "update_employee_title",
  "get_budget", "list_invoices",
];

function getToken(req: NextRequest): string | null {
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) return authHeader.slice(7);
  return req.cookies.get("p7_id_token")?.value ?? null;
}

// GET /api/p7/delegations — returns { toolName: boolean } for the current user
export async function GET(req: NextRequest) {
  const token = getToken(req);
  if (!token) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  const email = getEmailFromToken(token);
  if (!email) return NextResponse.json({ error: "invalid_token" }, { status: 401 });

  const viewerSessionId = req.nextUrl.searchParams.get("viewer_session_id");

  try {
    const fga = makeFgaClient();
    const result = await fga.read(
      {
        user: `user:${fgaUserId(email, viewerSessionId)}`,
        relation: "delegated",
        object: "tool:",
      },
      { consistency: ConsistencyPreference.HigherConsistency },
    );

    const granted = new Set<string>(
      (result.tuples ?? [])
        .map((t) => t.key.object.replace("tool:", ""))
        .filter((t) => ALL_TOOLS.includes(t))
    );

    const delegations: Record<string, boolean> = {};
    for (const tool of ALL_TOOLS) {
      delegations[tool] = granted.has(tool);
    }
    return NextResponse.json(delegations);
  } catch (err) {
    console.error("[P7 delegations GET]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// POST /api/p7/delegations — grant { tool }
export async function POST(req: NextRequest) {
  const token = getToken(req);
  if (!token) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  const email = getEmailFromToken(token);
  if (!email) return NextResponse.json({ error: "invalid_token" }, { status: 401 });

  const body = await req.json() as { tool?: string; viewer_session_id?: string };
  const tool = body.tool;
  if (!tool || !ALL_TOOLS.includes(tool)) {
    return NextResponse.json({ error: "invalid_tool" }, { status: 400 });
  }

  try {
    const fga = makeFgaClient();
    await fga.writeTuples([{
      user: `user:${fgaUserId(email, body.viewer_session_id)}`,
      relation: "delegated",
      object: `tool:${tool}`,
    }]);
    await emitFgaEvent(tool, "granted", email, body.viewer_session_id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[P7 delegations POST]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// DELETE /api/p7/delegations — revoke { tool }
export async function DELETE(req: NextRequest) {
  const token = getToken(req);
  if (!token) return NextResponse.json({ error: "not_authenticated" }, { status: 401 });

  const email = getEmailFromToken(token);
  if (!email) return NextResponse.json({ error: "invalid_token" }, { status: 401 });

  const body = await req.json() as { tool?: string; viewer_session_id?: string };
  const tool = body.tool;
  if (!tool || !ALL_TOOLS.includes(tool)) {
    return NextResponse.json({ error: "invalid_tool" }, { status: 400 });
  }

  try {
    const fga = makeFgaClient();
    await fga.deleteTuples([{
      user: `user:${fgaUserId(email, body.viewer_session_id)}`,
      relation: "delegated",
      object: `tool:${tool}`,
    }]);
    await emitFgaEvent(tool, "revoked", email, body.viewer_session_id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[P7 delegations DELETE]", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
