import { LandingGrid } from "@/components/LandingGrid";
import { PATTERNS } from "@/lib/patterns";
import { ShieldCheck } from "lucide-react";

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
        <p className="mx-auto max-w-xl text-sm text-slate-400">
          Eight patterns for securing AI agents with Okta. Each pattern is
          independently runnable — select one to see the live auth flow and
          interact with the agent.
        </p>
      </div>

      <LandingGrid patterns={PATTERNS} activeIds={[...active]} />
    </main>
  );
}
