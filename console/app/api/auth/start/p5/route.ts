import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const domain = process.env.OKTA_DOMAIN;
  const clientId = process.env.P5_OKTA_CLIENT_ID;

  if (!domain || !clientId) {
    return NextResponse.json(
      { error: "OKTA_DOMAIN and P5_OKTA_CLIENT_ID must be set" },
      { status: 500 }
    );
  }

  const state = crypto.randomUUID();
  const origin = process.env.NEXTAUTH_URL ?? req.nextUrl.origin;
  const redirectUri = `${origin}/api/auth/callback/p5`;

  const url = new URL(`https://${domain}/oauth2/v1/authorize`);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid profile email");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);

  const response = NextResponse.redirect(url);
  response.cookies.set("p5_state", state, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 300,
    path: "/",
  });
  return response;
}
