export const runtime = "edge";

import { NextRequest } from "next/server";

const eventBusBase = () =>
  process.env.EVENT_BUS_INTERNAL_URL ?? "http://localhost:4000";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const sessionId = req.nextUrl.searchParams.get("sessionId");
  const qs = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : "";
  try {
    await fetch(`${eventBusBase()}/events/${id}${qs}`, { method: "DELETE" });
  } catch {
    // event-bus unreachable — not fatal; local state cleared by caller
  }
  return new Response(null, { status: 204 });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const sessionId = req.nextUrl.searchParams.get("sessionId");
  const qs = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : "";
  const upstream = `${eventBusBase()}/events/${id}${qs}`;

  let upstreamRes: Response;
  try {
    upstreamRes = await fetch(upstream, {
      headers: { Accept: "text/event-stream", "Cache-Control": "no-cache" },
    });
  } catch {
    return new Response("event-bus unreachable", { status: 502 });
  }

  if (!upstreamRes.body) {
    return new Response("no stream body from event-bus", { status: 502 });
  }

  return new Response(upstreamRes.body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
