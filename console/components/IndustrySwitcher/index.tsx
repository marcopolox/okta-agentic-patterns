"use client";

import { INDUSTRIES, type IndustryId } from "@/lib/industries";

interface Props {
  currentIndustryId: IndustryId;
}

export function IndustrySwitcher({ currentIndustryId }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      {INDUSTRIES.map((t) => {
        const isActive = t.id === currentIndustryId;
        return (
          <button
            key={t.id}
            disabled
            title="Industry switching is disabled in this environment"
            style={
              isActive
                ? {
                    borderColor: "var(--neon-cyan)",
                    backgroundColor: "rgb(var(--neon-accent) / 0.12)",
                    color: "var(--neon-cyan)",
                  }
                : undefined
            }
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium cursor-not-allowed opacity-40 grayscale ${
              isActive
                ? "border-transparent text-white"
                : "border-white/10 bg-white/[0.03] text-slate-400"
            }`}
          >
            <span>{t.icon}</span>
            <span>{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}
