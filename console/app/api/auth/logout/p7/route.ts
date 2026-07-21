import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const base = process.env.NEXTAUTH_URL ?? req.nextUrl.origin;
  const idToken = req.cookies.get("p7_id_token")?.value;
  const domain = process.env.OKTA_DOMAIN;

  const postLogoutUri = new URL("/patterns/p7", base).toString();
  let redirectTarget: string;

  if (idToken && domain) {
    const logoutUrl = new URL(`https://${domain}/oauth2/v1/logout`);
    logoutUrl.searchParams.set("id_token_hint", idToken);
    logoutUrl.searchParams.set("post_logout_redirect_uri", postLogoutUri);
    redirectTarget = logoutUrl.toString();
  } else {
    redirectTarget = postLogoutUri;
  }

  const eventBusUrl = process.env.EVENT_BUS_URL ?? "http://event-bus:4000";
  await fetch(`${eventBusUrl}/events/p7`, { method: "DELETE" }).catch(() => {});

  const response = NextResponse.redirect(redirectTarget);
  response.cookies.delete("p7_id_token");
  return response;
}
