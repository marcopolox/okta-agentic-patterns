export const runtime = "edge";

import { NextRequest } from "next/server";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const eventBusBase =
    process.env.EVENT_BUS_INTERNAL_URL ?? "http://localhost:4000";
  const upstream = `${eventBusBase}/events/${id}`;

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
