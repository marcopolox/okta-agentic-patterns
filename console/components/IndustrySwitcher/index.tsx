"use client";

import { useState } from "react";
import { INDUSTRIES, type IndustryId } from "@/lib/industries";

interface Props {
  currentIndustryId: IndustryId;
}

export function IndustrySwitcher({ currentIndustryId }: Props) {
  const [busy, setBusy] = useState(false);
  const [activeId, setActiveId] = useState<IndustryId>(currentIndustryId);

  async function select(industryId: IndustryId) {
    if (industryId === activeId || busy) return;
    window.dispatchEvent(new Event("theme-transition"));
    setBusy(true);
    setActiveId(industryId);
    document.documentElement.setAttribute("data-theme", industryId);
    try {
      await fetch("/api/industry", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ industryId }),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {INDUSTRIES.map((t) => {
        const isActive = t.id === activeId;
        return (
          <button
            key={t.id}
            onClick={() => select(t.id)}
            disabled={busy}
            style={
              isActive
                ? {
                    borderColor: "var(--neon-cyan)",
                    backgroundColor: "rgb(var(--neon-accent) / 0.12)",
                    color: "var(--neon-cyan)",
                  }
                : undefined
            }
            className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition disabled:opacity-50 ${
              isActive
                ? "border-transparent text-white"
                : "border-white/10 bg-white/[0.03] text-slate-400 hover:border-white/20 hover:bg-white/[0.06] hover:text-white"
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
