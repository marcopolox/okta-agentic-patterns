import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

interface PkceState {
  cid: string;
  cs: string;
  cv: string;
  ru: string;
}

export async function GET(req: NextRequest) {
  // Next.js resolves req.url/req.nextUrl.origin from the server's own bind address in this
  // deployment topology (direct port-mapped container behind an EC2 host), not the public
  // Host header the browser sent — always redirect against the configured public URL instead.
  const base = process.env.NEXTAUTH_URL ?? req.nextUrl.origin;
  const { searchParams } = req.nextUrl;
  const code = searchParams.get("code");
  const stateParam = searchParams.get("state");
  const errorParam = searchParams.get("error");

  if (errorParam) {
    return NextResponse.redirect(new URL(`/patterns/p2?error=${encodeURIComponent(errorParam)}`, base));
  }

  if (!code || !stateParam) {
    return NextResponse.redirect(new URL("/patterns/p2?error=missing_params", base));
  }

  let pkceState: PkceState;
  try {
    const decoded = Buffer.from(stateParam, "base64url").toString("utf8");
    pkceState = JSON.parse(decoded) as PkceState;
  } catch {
    return NextResponse.redirect(new URL("/patterns/p2?error=invalid_state", base));
  }

  const { cid, cs, cv, ru } = pkceState;
  const adapterUrl = process.env.MCP_ADAPTER_URL;
  if (!adapterUrl) {
    return NextResponse.redirect(new URL("/patterns/p2?error=adapter_not_configured", base));
  }

  const tokenEndpoint = `${adapterUrl}/oauth2/v1/token`;
  const credentials = Buffer.from(`${cid}:${cs}`).toString("base64");

  let accessToken: string;
  let idToken: string | undefined;
  try {
    const tokenResp = await fetch(tokenEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${credentials}`,
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: ru,
        code_verifier: cv,
      }),
    });

    if (!tokenResp.ok) {
      const errText = await tokenResp.text();
      console.error("[p2/callback] token exchange failed:", tokenResp.status, errText);
      return NextResponse.redirect(new URL("/patterns/p2?error=token_exchange_failed", base));
    }

    const tokenData = (await tokenResp.json()) as { access_token?: string; id_token?: string };
    if (!tokenData.access_token) {
      return NextResponse.redirect(new URL("/patterns/p2?error=no_access_token", base));
    }
    accessToken = tokenData.access_token;
    idToken = tokenData.id_token;
  } catch (err) {
    console.error("[p2/callback] fetch error:", err);
    return NextResponse.redirect(new URL("/patterns/p2?error=auth_failed", base));
  }

  const cookieStore = await cookies();
  cookieStore.set("p2_access_token", accessToken, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 3600,
    path: "/",
  });
  if (idToken) {
    cookieStore.set("p2_id_token", idToken, {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 3600,
      path: "/",
    });
  }

  return NextResponse.redirect(new URL("/patterns/p2", base));
}
