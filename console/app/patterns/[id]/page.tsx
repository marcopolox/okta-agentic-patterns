import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { getPattern } from "@/lib/patterns";
import { getIndustryOverrides, DEFAULT_INDUSTRY_ID } from "@/lib/industries";
import { PatternInteraction } from "./PatternInteraction";

export const revalidate = 0;

interface Props {
  params: Promise<{ id: string }>;
}

export default async function PatternPage({ params }: Props) {
  const { id } = await params;
  const pattern = getPattern(id);
  if (!pattern) notFound();

  if (pattern.disabled) {
    return (
      <main className="relative flex h-full flex-col items-center justify-center px-6 py-3 text-center">
        <p className="text-lg font-medium text-slate-300">This use case is not accessible yet.</p>
        <p className="mt-2 text-sm text-slate-500">Check back soon.</p>
      </main>
    );
  }

  let active = false;
  const healthUrl = pattern.agentHealthUrl ?? pattern.agentUrl;
  if (healthUrl) {
    try {
      const res = await fetch(`${healthUrl}/health`, {
        cache: "no-store",
        signal: AbortSignal.timeout(2000),
      });
      active = res.ok;
    } catch {
      active = false;
    }
  }

  const cookieStore = await cookies();
  const TOKEN_COOKIES: Partial<Record<string, string>> = {
    p2: "p2_access_token",
    p3: "p3_id_token",
    p4: "p4_id_token",
    p5: "p5_id_token",
    p6: "p6_id_token",
    p7: "p7_id_token",
  };
  const cookieName = TOKEN_COOKIES[id];
  const userToken = cookieName ? (cookieStore.get(cookieName)?.value ?? null) : null;

  const industryId = cookieStore.get("demo_industry")?.value ?? DEFAULT_INDUSTRY_ID;
  const industryOverrides = getIndustryOverrides(industryId);

  const adapterConfigured = !pattern.requiresAdapter || !!process.env.MCP_ADAPTER_URL;

  return (
    <main className="relative flex h-full flex-col overflow-hidden px-6 py-3">
      <div className="mx-auto w-full max-w-6xl flex-1 min-h-0">
        <PatternInteraction pattern={pattern} active={active} userToken={userToken} themeOverrides={industryOverrides} adapterConfigured={adapterConfigured} />
      </div>
    </main>
  );
}
