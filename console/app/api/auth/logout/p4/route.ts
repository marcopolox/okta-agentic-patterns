import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const base = process.env.NEXTAUTH_URL ?? req.nextUrl.origin;
  const idToken = req.cookies.get("p4_id_token")?.value;
  const domain = process.env.OKTA_DOMAIN;
  const clientId = process.env.P4_OKTA_CLIENT_ID;

  const postLogoutUri = new URL("/patterns/p4", base).toString();

  let redirectTarget: string;
  if (domain && clientId) {
    const logoutUrl = new URL(`https://${domain}/oauth2/v1/logout`);
    logoutUrl.searchParams.set("client_id", clientId);
    logoutUrl.searchParams.set("post_logout_redirect_uri", postLogoutUri);
    if (idToken) logoutUrl.searchParams.set("id_token_hint", idToken);
    redirectTarget = logoutUrl.toString();
  } else {
    redirectTarget = postLogoutUri;
  }

  const eventBusUrl = process.env.EVENT_BUS_URL ?? "http://event-bus:4000";
  await fetch(`${eventBusUrl}/events/p4`, { method: "DELETE" }).catch(() => {});

  const response = NextResponse.redirect(redirectTarget);
  response.cookies.delete("p4_id_token");
  response.cookies.delete("p4_access_token");
  return response;
}
