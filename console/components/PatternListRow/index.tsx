"use client";

import { useRouter } from "next/navigation";
import { ArrowRight, Shield } from "lucide-react";
import { Pattern } from "@/lib/patterns";

interface PatternListRowProps {
  pattern: Pattern;
  active: boolean;
}

const statusDot: Record<string, string> = {
  done: "bg-emerald-400",
  blocked: "bg-red-400",
  pending: "bg-gray-500",
};

const rowBorder: Record<string, string> = {
  done: "border-emerald-500/30 bg-gray-800/80",
  blocked: "border-red-500/30 bg-gray-800/60",
  pending: "border-gray-700/40 bg-gray-800/40",
};

export function PatternListRow({ pattern, active }: PatternListRowProps) {
  const router = useRouter();

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => !pattern.disabled && router.push(`/patterns/${pattern.id}`)}
      onKeyDown={(e) => e.key === "Enter" && !pattern.disabled && router.push(`/patterns/${pattern.id}`)}
      className={`flex items-center gap-4 rounded-xl border px-5 py-4 transition-colors ${
        pattern.disabled
          ? "cursor-not-allowed opacity-40 grayscale"
          : `cursor-pointer hover:bg-gray-700/40 ${rowBorder[pattern.buildStatus]}`
      }`}
    >
      {/* Status dot + ID */}
      <div className="flex shrink-0 flex-col items-center gap-1.5 w-10">
        <div className={`h-2 w-2 rounded-full ${pattern.disabled ? "bg-gray-600" : statusDot[pattern.buildStatus]}`} />
        <span className="font-mono text-[11px] font-semibold tracking-widest text-cyan-400 uppercase">
          {pattern.id}
        </span>
      </div>

      {/* Title + description */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="text-sm font-semibold text-white">{pattern.title}</span>
          {pattern.requiresAdapter && (
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-400">
              Bridge
            </span>
          )}
          {pattern.badge && (
            <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-medium text-violet-400">
              {pattern.badge}
            </span>
          )}
        </div>
        <p className="truncate text-xs text-slate-400">{pattern.description}</p>
      </div>

      {/* Auth flow */}
      <div className="hidden md:flex shrink-0 items-center gap-1.5 text-xs text-slate-500 w-44">
        <Shield size={11} className="shrink-0" />
        <span className="truncate">{pattern.authFlow}</span>
      </div>

      {/* Action */}
      <div className="shrink-0">
        {pattern.disabled ? (
          <span className="rounded-lg border border-gray-700/40 bg-gray-800/40 px-3 py-1.5 text-xs font-medium text-slate-600">
            Not Available
          </span>
        ) : active && !pattern.hideCta ? (
          <button
            onClick={(e) => { e.stopPropagation(); router.push(`/patterns/${pattern.id}`); }}
            className="flex items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/20 px-3 py-1.5 text-xs font-medium text-cyan-300 hover:bg-cyan-500/30"
          >
            Run Demo
            <ArrowRight size={12} />
          </button>
        ) : null}
      </div>
    </div>
  );
}
