import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { isValidIndustryId, DEFAULT_INDUSTRY_ID } from "@/lib/industries";

export async function GET() {
  const cookieStore = await cookies();
  const industryId = cookieStore.get("demo_industry")?.value ?? DEFAULT_INDUSTRY_ID;
  return NextResponse.json({ industryId });
}

export async function POST(req: NextRequest) {
  const { industryId } = await req.json();
  if (!isValidIndustryId(industryId)) {
    return NextResponse.json({ error: "invalid industry" }, { status: 400 });
  }

  const mcpUrls = [
    process.env.HR_SERVER_URL,
    process.env.FINANCE_SERVER_URL,
    process.env.INVENTORY_SERVER_URL,
  ].filter(Boolean) as string[];

  await Promise.allSettled(
    mcpUrls.map((url) =>
      fetch(`${url}/set-theme`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ themeId: industryId }),
        signal: AbortSignal.timeout(2000),
      })
    )
  );

  const res = NextResponse.json({ ok: true });
  res.cookies.set("demo_industry", industryId, {
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
    sameSite: "lax",
  });
  return res;
}
