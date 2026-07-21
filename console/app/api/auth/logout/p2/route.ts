import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const base = process.env.NEXTAUTH_URL ?? req.nextUrl.origin;
  const accessToken = req.cookies.get("p2_access_token")?.value;
  const domain = process.env.OKTA_DOMAIN;

  const postLogoutUri = new URL("/patterns/p2", base).toString();

  let redirectTarget: string;
  if (accessToken && domain) {
    const logoutUrl = new URL(`https://${domain}/oauth2/v1/logout`);
    logoutUrl.searchParams.set("post_logout_redirect_uri", postLogoutUri);
    redirectTarget = logoutUrl.toString();
  } else {
    redirectTarget = postLogoutUri;
  }

  const response = NextResponse.redirect(redirectTarget);
  response.cookies.delete("p2_access_token");
  return response;
}
