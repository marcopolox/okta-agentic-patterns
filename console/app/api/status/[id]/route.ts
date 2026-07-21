import { NextRequest } from "next/server";
import { getPattern } from "@/lib/patterns";

async function proxyToAgent(
  id: string,
  path: string,
  method: string,
  body?: string
): Promise<Response> {
  const pattern = getPattern(id);
  const agentBase = pattern?.agentHealthUrl ?? pattern?.agentUrl;

  if (!agentBase) {
    return new Response(JSON.stringify({ error: "Unknown pattern" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const upstream = `${agentBase}${path}`;
  let upstreamRes: Response;
  try {
    upstreamRes = await fetch(upstream, {
      method,
      headers: { "Content-Type": "application/json" },
      ...(body ? { body } : {}),
    });
  } catch {
    return new Response(
      JSON.stringify({ error: `Agent unreachable at ${agentBase}` }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }

  const text = await upstreamRes.text();
  return new Response(text, {
    status: upstreamRes.status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  return proxyToAgent(id, "/status", "GET");
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.text().catch(() => "");
  return proxyToAgent(id, "/refresh", "POST", body);
}
