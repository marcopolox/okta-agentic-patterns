import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { isValidVisualThemeId, DEFAULT_UI_THEME_ID } from "@/lib/ui-themes";

export async function GET() {
  const cookieStore = await cookies();
  const uiThemeId = cookieStore.get("demo_ui_theme")?.value ?? DEFAULT_UI_THEME_ID;
  return NextResponse.json({ uiThemeId });
}

export async function POST(req: NextRequest) {
  const { uiThemeId } = await req.json();
  if (!isValidVisualThemeId(uiThemeId)) {
    return NextResponse.json({ error: "invalid theme" }, { status: 400 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set("demo_ui_theme", uiThemeId, {
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
    sameSite: "lax",
  });
  return res;
}
