import { PatternCard } from "@/components/PatternCard";
import { PATTERNS } from "@/lib/patterns";
import { ShieldCheck } from "lucide-react";
import { cookies } from "next/headers";
import { getIndustry, DEFAULT_INDUSTRY_ID } from "@/lib/industries";

export const revalidate = 0;

async function getActivePatterns(): Promise<Set<string>> {
  const active = new Set<string>();
  await Promise.allSettled(
    PATTERNS.filter((p) => p.agentUrl).map(async (p) => {
      try {
        const res = await fetch(`${p.agentUrl}/health`, {
          cache: "no-store",
          signal: AbortSignal.timeout(2000),
        });
        if (res.ok) active.add(p.id);
      } catch {
        // service not running — stays inactive
      }
    })
  );
  return active;
}

export default async function Home() {
  const cookieStore = await cookies();
  const industryId = cookieStore.get("demo_industry")?.value ?? DEFAULT_INDUSTRY_ID;
  const industry = getIndustry(industryId);
  const active = await getActivePatterns();

  return (
    <main className="relative min-h-screen px-6 py-8">
      {/* Header */}
      <div className="mx-auto mb-8 max-w-5xl text-center">
        <div
          className="mb-2 inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-medium neon-text neon-border"
          style={{ background: "rgb(var(--neon-accent) / 0.1)", color: "var(--neon-cyan)", borderColor: "rgb(var(--neon-accent) / 0.5)" }}
        >
          <ShieldCheck size={14} />
          Okta Agentic Identity Patterns
        </div>
        <h1 className="mb-2 text-3xl font-bold tracking-tight text-white">
          Okta Agentic Demo{industryId !== DEFAULT_INDUSTRY_ID ? ` for ${industry.label}` : ""}
        </h1>
        <p className="mx-auto max-w-xl text-sm text-slate-400">
          Eight patterns for securing AI agents with Okta. Each pattern is
          independently runnable — select one to see the live auth flow and
          interact with the agent.
        </p>
      </div>

      {/* Pattern grid */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6">
        {PATTERNS.map((p) => (
          <PatternCard key={p.id} pattern={p} active={active.has(p.id)} />
        ))}
      </div>
    </main>
  );
}
