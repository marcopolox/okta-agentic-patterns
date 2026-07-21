import { NextRequest, NextResponse } from "next/server";

// P6 "User sign-on": the user authenticates through the console (app) and kicks off
// the orchestrator, which acts on their behalf and delegates to worker agents (A2A).
export async function GET(req: NextRequest) {
  const domain = process.env.OKTA_DOMAIN;
  const clientId = process.env.P6_ORCHESTRATOR_OKTA_CLIENT_ID;

  if (!domain || !clientId) {
    return NextResponse.json(
      { error: "OKTA_DOMAIN and P6_ORCHESTRATOR_OKTA_CLIENT_ID must be set" },
      { status: 500 }
    );
  }

  const state = crypto.randomUUID();
  const origin = process.env.NEXTAUTH_URL ?? req.nextUrl.origin;
  const redirectUri = `${origin}/api/auth/callback/p6`;

  const url = new URL(`https://${domain}/oauth2/v1/authorize`);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid profile email");
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("state", state);

  const response = NextResponse.redirect(url);
  response.cookies.set("p6_state", state, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 300,
    path: "/",
  });
  return response;
}
