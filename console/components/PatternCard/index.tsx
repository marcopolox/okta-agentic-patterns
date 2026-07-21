"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, Shield } from "lucide-react";
import { Pattern } from "@/lib/patterns";
import { ArchDiagramModal } from "@/components/ArchDiagramModal";

interface PatternCardProps {
  pattern: Pattern;
  active: boolean;
}

const borderClass: Record<string, string> = {
  done: "border-emerald-500/50 bg-gray-800/80 neon-green-border",
  blocked: "border-red-500/50 bg-gray-800/60 neon-red-border",
  pending: "border-gray-700/50 bg-gray-800/40",
};

export function PatternCard({ pattern, active }: PatternCardProps) {
  const router = useRouter();
  const [showDiagram, setShowDiagram] = useState(false);

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => router.push(`/patterns/${pattern.id}`)}
        onKeyDown={(e) => e.key === "Enter" && router.push(`/patterns/${pattern.id}`)}
        className={`relative flex flex-col rounded-xl border p-6 neon-card cursor-pointer ${borderClass[pattern.buildStatus]}`}
      >
        {/* Header row */}
        <div className="mb-3 flex items-start justify-between gap-3">
          <span className="font-mono text-xs font-semibold tracking-widest text-cyan-400 uppercase neon-text">
            {pattern.id}
          </span>
          <div className="flex items-center gap-1.5">
            {pattern.requiresAdapter && (
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-400">
                Bridge
              </span>
            )}
            {pattern.badge && (
              <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[11px] font-medium text-violet-400">
                {pattern.badge}
              </span>
            )}
          </div>
        </div>

        {/* Title */}
        <h3 className="mb-1 text-base font-semibold text-white">{pattern.title}</h3>
        <p className="mb-3 text-xs text-slate-400">{pattern.subtitle}</p>

        {/* Description */}
        <p className="mb-4 flex-1 text-sm leading-relaxed text-slate-300">
          {pattern.description}
        </p>

        {/* Auth flow badge */}
        <div className="mb-4 flex items-center gap-1.5 text-xs text-slate-500">
          <Shield size={11} className="shrink-0" />
          <span>{pattern.authFlow}</span>
        </div>

        {/* Note (e.g. requirements for pending patterns) */}
        {pattern.note && (
          <p className="mb-3 text-[11px] text-amber-400/70 italic">{pattern.note}</p>
        )}

        {/* Architecture diagram links (P8: one per platform) */}
        {pattern.id === "p8" && pattern.platforms && (
          <div className="mb-3 grid grid-cols-2 gap-2">
            {pattern.platforms.map((platform) => (
              <button
                key={platform.label}
                onClick={(e) => {
                  e.stopPropagation();
                  if (platform.diagramUrl) window.open(platform.diagramUrl, "_blank");
                }}
                disabled={!platform.diagramUrl}
                title={platform.label}
                className={`truncate rounded-lg px-2 py-1.5 text-[11px] font-medium border transition-colors ${
                  platform.diagramUrl
                    ? "cursor-pointer border-gray-600/40 bg-gray-700/50 text-slate-300 hover:bg-gray-700 hover:text-white"
                    : "cursor-not-allowed border-gray-700/30 bg-gray-700/20 text-slate-600"
                }`}
              >
                {platform.label}
              </button>
            ))}
          </div>
        )}

        {/* CTA */}
        {pattern.buildStatus === "pending" && pattern.note ? (
          <div className="flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium bg-gray-700/30 text-slate-600 border border-gray-700/40 cursor-not-allowed select-none">
            Coming Soon
          </div>
        ) : active ? (
          <button
            onClick={(e) => { e.stopPropagation(); router.push(`/patterns/${pattern.id}`); }}
            className="flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium neon-btn bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 hover:bg-cyan-500/30"
          >
            Run Demo
            <ArrowRight size={14} />
          </button>
        ) : (
          <button
            onClick={(e) => { e.stopPropagation(); setShowDiagram(true); }}
            className="flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium neon-btn bg-gray-700/50 text-slate-400 border border-gray-600/40 hover:bg-gray-700 hover:text-slate-300"
          >
            View Pattern
            <ArrowRight size={14} />
          </button>
        )}
      </div>

      <ArchDiagramModal
        pattern={pattern}
        active={active}
        open={showDiagram}
        onClose={() => setShowDiagram(false)}
      />
    </>
  );
}
