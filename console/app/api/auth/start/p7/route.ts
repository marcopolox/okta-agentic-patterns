import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const domain = process.env.OKTA_DOMAIN;
  const clientId = process.env.P7_OKTA_CLIENT_ID;

  if (!domain || !clientId) {
    return NextResponse.redirect(new URL("/patterns/p7?error=missing_config", req.nextUrl.origin));
  }

  const state = crypto.randomUUID();
  const base = process.env.NEXTAUTH_URL ?? req.nextUrl.origin;
  const redirectUri = `${base}/api/auth/callback/p7`;

  const url = new URL(`https://${domain}/oauth2/v1/authorize`);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid profile email");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);

  const response = NextResponse.redirect(url.toString());
  response.cookies.set("p7_state", state, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 300,
    path: "/",
  });
  return response;
}
