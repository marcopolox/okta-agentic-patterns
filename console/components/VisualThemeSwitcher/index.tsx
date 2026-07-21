"use client";

import { useState } from "react";
import { VISUAL_THEMES, type VisualThemeId } from "@/lib/ui-themes";

interface Props {
  currentUiThemeId: VisualThemeId;
}

const PREVIEW_COLORS: Record<VisualThemeId, string> = {
  dark: "#0d1117",
  light: "#f0f9ff",
  colorful: "#fdf4ff",
  monochrome: "#0a0a0a",
  "old-school": "#000000",
};

const PREVIEW_ACCENT: Record<VisualThemeId, string> = {
  dark: "#22d3ee",
  light: "#22d3ee",
  colorful: "#c026d3",
  monochrome: "#9ca3af",
  "old-school": "#00ff41",
};

export function VisualThemeSwitcher({ currentUiThemeId }: Props) {
  const [busy, setBusy] = useState(false);
  const [activeId, setActiveId] = useState<VisualThemeId>(() => {
    if (typeof document !== "undefined") {
      const fromDom = document.documentElement.getAttribute("data-ui-theme") as VisualThemeId | null;
      if (fromDom) return fromDom;
    }
    return currentUiThemeId;
  });

  async function select(uiThemeId: VisualThemeId) {
    if (uiThemeId === activeId || busy) return;
    window.dispatchEvent(new Event("theme-transition"));
    setBusy(true);
    setActiveId(uiThemeId);
    document.documentElement.setAttribute("data-ui-theme", uiThemeId);
    try {
      await fetch("/api/ui-theme", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uiThemeId }),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap gap-3">
      {VISUAL_THEMES.map((t) => {
        const isActive = t.id === activeId;
        const bg = PREVIEW_COLORS[t.id];
        const accent = PREVIEW_ACCENT[t.id];
        return (
          <button
            key={t.id}
            onClick={() => select(t.id)}
            disabled={busy}
            title={t.description}
            className={`group flex flex-col items-center gap-2 rounded-xl border p-3 text-sm font-medium transition-all disabled:opacity-50 ${
              isActive
                ? "border-cyan-500/60 bg-cyan-500/10 text-cyan-300"
                : "border-white/10 bg-white/[0.03] text-slate-400 hover:border-white/20 hover:bg-white/[0.06] hover:text-white"
            }`}
            style={isActive ? { borderColor: "var(--neon-cyan)", backgroundColor: "rgb(var(--neon-accent) / 0.1)" } : undefined}
          >
            {/* Mini preview swatch */}
            <span
              className="flex h-8 w-14 items-center justify-center rounded-md border text-xs font-bold"
              style={{
                backgroundColor: bg,
                borderColor: isActive ? accent : "rgba(255,255,255,0.15)",
                color: accent,
                fontFamily: t.id === "old-school" ? "monospace" : undefined,
                letterSpacing: t.id === "old-school" ? "0.05em" : undefined,
              }}
            >
              Aa
            </span>
            <span className="leading-none">{t.label}</span>
            {isActive && (
              <span className="h-1 w-1 rounded-full" style={{ backgroundColor: "var(--neon-cyan)" }} />
            )}
          </button>
        );
      })}
    </div>
  );
}
