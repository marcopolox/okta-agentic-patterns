import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

async function emitEvent(
  actor: string,
  action: string,
  target: string,
  detail?: string,
  token?: string,
  level: "info" | "auth" | "token" | "error" = "info",
) {
  const eventBusUrl = process.env.EVENT_BUS_URL;
  if (!eventBusUrl) return;
  await fetch(`${eventBusUrl}/emit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      id: crypto.randomUUID(),
      patternId: "p6",
      timestamp: new Date().toISOString(),
      actor,
      action,
      target,
      detail,
      token,
      level,
    }),
  }).catch(() => {});
}

export async function POST(req: NextRequest) {
  const { message, session_id } = (await req.json()) as { message: string; session_id?: string };

  const tokenUrl = `https://${process.env.OKTA_DOMAIN}/oauth2/${process.env.P6_ORCH_A2A_AUTHZ_SERVER_ID}/v1/token`;

  await emitEvent(
    "Console",
    "acquiring CC token",
    "Okta",
    `grant_type=client_credentials\nscope=agent.invoke\nresource=${process.env.P6_ORCH_A2A_RESOURCE ?? ""}`,
    undefined,
    "auth",
  );

  const tokenResp = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: process.env.P6_ORCHESTRATOR_OKTA_CLIENT_ID ?? "",
      client_secret: process.env.P6_ORCHESTRATOR_OKTA_CLIENT_SECRET ?? "",
      scope: "agent.invoke",
      resource: process.env.P6_ORCH_A2A_RESOURCE ?? "",
    }),
  });

  if (!tokenResp.ok) {
    const err = await tokenResp.text();
    await emitEvent("Console", "CC grant failed", "Okta", err, undefined, "error");
    return NextResponse.json({ error: `CC grant failed: ${err}` }, { status: 502 });
  }

  const { access_token } = (await tokenResp.json()) as { access_token: string };

  await emitEvent(
    "Console",
    "CC token acquired",
    "P6 Orchestrator",
    "scope=agent.invoke — invoking orchestrator",
    access_token,
    "token",
  );

  const agentUrl = process.env.P6_AGENT_INTERNAL_URL ?? "http://p6-agent:3600";
  const invokeResp = await fetch(`${agentUrl}/invoke`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${access_token}`,
    },
    body: JSON.stringify({ message, session_id }),
  });

  if (!invokeResp.ok || !invokeResp.body) {
    await emitEvent("Console", "invoke failed", "P6 Orchestrator", `HTTP ${invokeResp.status}`, undefined, "error");
    return NextResponse.json({ error: `Invoke failed: HTTP ${invokeResp.status}` }, { status: 502 });
  }

  return new NextResponse(invokeResp.body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
