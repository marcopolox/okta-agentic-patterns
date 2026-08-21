import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

async function emitEvent(
  actor: string,
  action: string,
  target: string,
  detail?: string,
  token?: string,
  level: "info" | "auth" | "token" | "error" = "info",
  sessionId?: string,
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
      sessionId,
    }),
  }).catch(() => {});
}

export async function POST(req: NextRequest) {
  const { message, session_id, viewer_session_id } = (await req.json()) as {
    message: string;
    session_id?: string;
    viewer_session_id?: string;
  };

  const tokenUrl = `https://${process.env.OKTA_DOMAIN}/oauth2/${process.env.P6_ORCH_A2A_AUTHZ_SERVER_ID}/v1/token`;

  await emitEvent(
    "Console",
    "acquiring CC token",
    "Okta",
    `grant_type=client_credentials\nscope=agent.invoke\nresource=${process.env.P6_ORCH_A2A_RESOURCE ?? ""}`,
    undefined,
    "auth",
    viewer_session_id,
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
    await emitEvent("Console", "CC grant failed", "Okta", err, undefined, "error", viewer_session_id);
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
    viewer_session_id,
  );

  const llmApiKey = req.headers.get("x-llm-api-key");
  const llmProvider = req.headers.get("x-llm-provider");
  const llmBaseUrl = req.headers.get("x-llm-base-url");
  const llmModel = req.headers.get("x-llm-model");
  const slackToken = req.headers.get("x-slack-token");
  const slackChannel = req.headers.get("x-slack-channel");

  const agentUrl = process.env.P6_AGENT_INTERNAL_URL ?? "http://p6-agent:3600";
  const invokeResp = await fetch(`${agentUrl}/invoke`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${access_token}`,
      ...(llmApiKey ? { "X-LLM-Api-Key": llmApiKey, "X-LLM-Provider": llmProvider ?? "anthropic" } : {}),
      ...(llmBaseUrl ? { "X-LLM-Base-Url": llmBaseUrl } : {}),
      ...(llmModel ? { "X-LLM-Model": llmModel } : {}),
      ...(slackToken ? { "X-Slack-Token": slackToken } : {}),
      ...(slackChannel ? { "X-Slack-Channel": slackChannel } : {}),
    },
    body: JSON.stringify({ message, session_id, viewer_session_id }),
  });

  if (!invokeResp.ok || !invokeResp.body) {
    await emitEvent("Console", "invoke failed", "P6 Orchestrator", `HTTP ${invokeResp.status}`, undefined, "error", viewer_session_id);
    return NextResponse.json({ error: `Invoke failed: HTTP ${invokeResp.status}` }, { status: 502 });
  }

  return new NextResponse(invokeResp.body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
