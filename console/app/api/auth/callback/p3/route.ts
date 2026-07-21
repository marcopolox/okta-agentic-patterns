import { NextRequest, NextResponse } from "next/server";

// Exchange authorization code for tokens using server-side confidential client.
// Stores the id_token in an HttpOnly cookie so the page.tsx server component can read it
// and pass it to the P3 agent as the user's identity for XAA delegation.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const base = process.env.NEXTAUTH_URL ?? req.nextUrl.origin;

  if (error) {
    return NextResponse.redirect(
      new URL(`/patterns/p3?error=${encodeURIComponent(error)}`, base)
    );
  }

  if (!code) {
    return NextResponse.redirect(new URL("/patterns/p3?error=no_code", base));
  }

  const domain = process.env.OKTA_DOMAIN;
  const clientId = process.env.P3_OKTA_CLIENT_ID;
  const clientSecret = process.env.P3_OKTA_CLIENT_SECRET;
  const redirectUri = `${base}/api/auth/callback/p3`;

  if (!domain || !clientId || !clientSecret) {
    return NextResponse.redirect(
      new URL("/patterns/p3?error=missing_config", base)
    );
  }

  const tokenRes = await fetch(`https://${domain}/oauth2/v1/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenRes.ok) {
    const body = await tokenRes.text();
    return NextResponse.redirect(
      new URL(`/patterns/p3?error=${encodeURIComponent(body)}`, base)
    );
  }

  const tokens = await tokenRes.json() as { id_token?: string };
  const response = NextResponse.redirect(new URL("/patterns/p3", base));

  if (tokens.id_token) {
    response.cookies.set("p3_id_token", tokens.id_token, {
      httpOnly: true,
      maxAge: 3600,
      sameSite: "lax",
      path: "/",
    });

    const idToken = tokens.id_token;
    const snippet = idToken.slice(0, 12) + "..." + idToken.slice(-8);

    let claims: Record<string, unknown> = {};
    try {
      claims = JSON.parse(Buffer.from(idToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
    } catch { /* ignore */ }

    const claimsDetail = [
      claims.sub ? `sub=${claims.sub}` : null,
      claims.name ? `name=${claims.name}` : null,
      claims.email ? `email=${claims.email}` : null,
      claims.amr ? `amr=${JSON.stringify(claims.amr)}` : null,
    ].filter(Boolean).join(" | ");

    const eventBusUrl = process.env.EVENT_BUS_URL ?? "http://event-bus:4000";
    await fetch(`${eventBusUrl}/emit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        patternId: "p3",
        actor: "Okta",
        action: "issued id_token",
        target: "Console",
        detail: claimsDetail || "auth code exchanged for id_token",
        tokenSnippet: snippet,
        level: "token",
        token: idToken,
      }),
    }).catch(() => {});
  }

  return response;
}
