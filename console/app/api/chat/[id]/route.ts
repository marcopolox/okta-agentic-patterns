import { NextRequest } from "next/server";
import { getPattern } from "@/lib/patterns";

const CREDENTIAL_HEADERS = [
  "x-llm-api-key",
  "x-llm-provider",
  "x-slack-token",
  "x-slack-channel",
];

const FORWARD_HEADERS = [
  "authorization",
  "content-type",
  ...CREDENTIAL_HEADERS,
];

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const pattern = getPattern(id);
  const agentBase = pattern?.agentHealthUrl ?? pattern?.agentUrl;

  if (!agentBase) {
    return new Response(JSON.stringify({ error: "Unknown pattern" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const upstream = `${agentBase}/chat`;

  const forwarded: Record<string, string> = {};
  for (const name of FORWARD_HEADERS) {
    const val = req.headers.get(name);
    if (val) forwarded[name] = val;
  }

  let body: string;
  try {
    body = await req.text();
  } catch {
    return new Response(JSON.stringify({ error: "Failed to read request body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  let upstreamRes: Response;
  try {
    upstreamRes = await fetch(upstream, {
      method: "POST",
      headers: forwarded,
      body,
    });
  } catch {
    return new Response(
      JSON.stringify({ error: `Agent unreachable at ${agentBase}` }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }

  if (!upstreamRes.ok || !upstreamRes.body) {
    const status = upstreamRes.status;
    return new Response(
      JSON.stringify({ error: `Agent returned HTTP ${status}` }),
      { status, headers: { "Content-Type": "application/json" } }
    );
  }

  return new Response(upstreamRes.body, {
    status: upstreamRes.status,
    headers: {
      "Content-Type": upstreamRes.headers.get("content-type") ?? "text/plain",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    },
  });
}
