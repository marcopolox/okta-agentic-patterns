import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const idToken = req.cookies.get("p4_id_token")?.value;
  if (!idToken) {
    return NextResponse.json({ ok: false, error: "no_token" }, { status: 400 });
  }

  const agentUrl = process.env.P4_AGENT_INTERNAL_URL ?? "http://p4-agent:3400";
  const revokeRes = await fetch(`${agentUrl}/revoke`, {
    method: "POST",
    headers: { Authorization: `Bearer ${idToken}` },
  }).catch(() => null);

  if (!revokeRes) {
    return NextResponse.json({ ok: false, error: "agent_unreachable" }, { status: 502 });
  }

  const body = await revokeRes.json();
  return NextResponse.json(body, { status: revokeRes.status });
}
