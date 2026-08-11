"use client";

import { useState, useEffect } from "react";
import { LayoutGrid, List } from "lucide-react";
import { PatternCard } from "@/components/PatternCard";
import { PatternListRow } from "@/components/PatternListRow";
import { Pattern } from "@/lib/patterns";

type View = "grid" | "list";

interface LandingGridProps {
  patterns: Pattern[];
  activeIds: string[];
}

export function LandingGrid({ patterns, activeIds }: LandingGridProps) {
  const [view, setView] = useState<View>("grid");
  const active = new Set(activeIds);

  useEffect(() => {
    const saved = localStorage.getItem("landing-view");
    if (saved === "list" || saved === "grid") setView(saved);
  }, []);

  const switchView = (v: View) => {
    setView(v);
    localStorage.setItem("landing-view", v);
  };

  return (
    <>
      {/* View toggle */}
      <div className="mb-5 flex justify-end">
        <div className="flex items-center gap-0.5 rounded-lg border border-gray-700/50 bg-gray-800/60 p-1">
          <button
            onClick={() => switchView("grid")}
            title="Grid view"
            className={`flex items-center justify-center rounded-md p-1.5 transition-colors ${
              view === "grid"
                ? "bg-cyan-500/20 text-cyan-300"
                : "text-slate-500 hover:text-slate-300"
            }`}
          >
            <LayoutGrid size={16} />
          </button>
          <button
            onClick={() => switchView("list")}
            title="List view"
            className={`flex items-center justify-center rounded-md p-1.5 transition-colors ${
              view === "list"
                ? "bg-cyan-500/20 text-cyan-300"
                : "text-slate-500 hover:text-slate-300"
            }`}
          >
            <List size={16} />
          </button>
        </div>
      </div>

      {view === "grid" ? (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {patterns.map((p) => (
            <PatternCard key={p.id} pattern={p} active={active.has(p.id)} />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {patterns.map((p) => (
            <PatternListRow key={p.id} pattern={p} active={active.has(p.id)} />
          ))}
        </div>
      )}
    </>
  );
}
