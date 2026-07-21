import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const to = req.nextUrl.searchParams.get("to");
  if (!to) {
    return NextResponse.json({ error: "missing 'to' parameter" }, { status: 400 });
  }

  let adapterAuthUrl: string;
  try {
    adapterAuthUrl = Buffer.from(to, "base64url").toString("utf8");
    new URL(adapterAuthUrl); // validate it's a URL
  } catch {
    return NextResponse.json({ error: "invalid 'to' parameter" }, { status: 400 });
  }

  return NextResponse.redirect(adapterAuthUrl);
}
