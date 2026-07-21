"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Key, AlertCircle, Info, Trash2, ChevronDown, ChevronUp } from "lucide-react";
import { DemoEvent } from "@/lib/event-bus";
import { TokenClaims } from "@/components/TokenClaims";

interface EventStreamProps {
  events: DemoEvent[];
  onClear?: () => void;
}

const levelStyles: Record<DemoEvent["level"], string> = {
  info: "text-slate-400",
  auth: "text-cyan-300",
  token: "text-emerald-300",
  error: "text-red-400",
  separator: "",
};

const levelIcons: Record<DemoEvent["level"], React.ReactNode> = {
  info: <Info size={12} className="shrink-0 text-slate-500" />,
  auth: <ArrowRight size={12} className="shrink-0 text-cyan-400" />,
  token: <Key size={12} className="shrink-0 text-emerald-400" />,
  error: <AlertCircle size={12} className="shrink-0 text-red-400" />,
  separator: null,
};

// Left-border accent color per actor — visually groups the delegation chain
function getActorBorderColor(actor: string): string {
  const a = actor.toLowerCase();
  if (a.includes("console") || a.includes("run-autonomous")) return "border-l-2 border-l-slate-500/60";
  if (a.includes("orchestrator") || a.includes("orch")) return "border-l-2 border-l-cyan-500/60";
  if (a.includes("hr worker")) return "border-l-2 border-l-emerald-500/60";
  if (a.includes("finance worker")) return "border-l-2 border-l-teal-500/60";
  if (a.includes("hr server")) return "border-l-2 border-l-violet-500/60";
  if (a.includes("finance server")) return "border-l-2 border-l-purple-500/60";
  if (a.includes("inventory")) return "border-l-2 border-l-orange-500/60";
  if (a.includes("p3") || a.includes("p4") || a.includes("p5") || a.includes("p6") || a.includes("agent")) return "border-l-2 border-l-blue-500/60";
  return "border-l-2 border-l-gray-700/40";
}

function isLongDetail(detail: string): boolean {
  return detail.includes("\n") || detail.length > 120;
}

function EventRow({ ev }: { ev: DemoEvent }) {
  const [expanded, setExpanded] = useState(false);
  const hasLongDetail = ev.detail ? isLongDetail(ev.detail) : false;
  const borderColor = getActorBorderColor(ev.actor);

  const collapsedDetail = hasLongDetail && ev.detail
    ? ev.detail.split("\n")[0] + "…"
    : ev.detail;

  return (
    <div className={`flex flex-col gap-0.5 rounded-r pl-2 py-0.5 ${borderColor}`}>
      <div className="flex items-center gap-2">
        {levelIcons[ev.level]}
        <span className={`font-medium ${levelStyles[ev.level]}`}>
          {ev.actor}
        </span>
        <span className="text-slate-600">→</span>
        <span className="text-slate-300">{ev.action}</span>
        <span className="text-slate-600">→</span>
        <span className={levelStyles[ev.level]}>{ev.target}</span>
        <span className="ml-auto shrink-0 text-[10px] text-slate-700">
          {new Date(ev.timestamp).toLocaleTimeString()}
        </span>
      </div>

      {ev.detail && (
        <>
          <div className="ml-5 whitespace-pre-wrap text-[11px] text-slate-500">
            {hasLongDetail && !expanded ? collapsedDetail : ev.detail}
          </div>
          {hasLongDetail && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="ml-5 flex items-center gap-0.5 text-[10px] text-slate-600 hover:text-slate-400 transition-colors w-fit"
            >
              {expanded ? (
                <><ChevronUp size={10} /> hide</>
              ) : (
                <><ChevronDown size={10} /> show params</>
              )}
            </button>
          )}
        </>
      )}

      {ev.token ? (
        <TokenClaims token={ev.token} className="ml-5 mt-1" />
      ) : ev.tokenSnippet ? (
        <div className="ml-5 truncate rounded bg-gray-900/60 px-2 py-0.5 text-[11px] text-emerald-400">
          {ev.tokenSnippet}
        </div>
      ) : null}
    </div>
  );
}

export function EventStream({ events, onClear }: EventStreamProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [events]);

  return (
    <div className="flex h-full flex-col rounded-xl border border-gray-700/50 bg-gray-800/60 neon-card">
      <div className="flex items-center justify-between border-b border-gray-700/50 px-4 py-2">
        <span className="text-xs font-semibold tracking-wider text-cyan-400 uppercase neon-text">
          Event Flow
        </span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-600">{events.filter(e => e.level !== "separator").length} events</span>
          {onClear && (
            <button
              onClick={onClear}
              disabled={events.length === 0}
              className="flex items-center gap-1 rounded border border-gray-700/50 px-2 py-0.5 text-[11px] text-slate-500 transition-colors hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <Trash2 size={10} />
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 font-mono text-xs">
        {events.length === 0 ? (
          <p className="mt-4 text-center text-slate-600">
            Waiting for events…
          </p>
        ) : (
          <div className="space-y-2">
            {events.map((ev) => ev.level === "separator" ? (
              <div key={ev.id} className="flex items-center gap-2 py-1">
                <div className="h-px flex-1 bg-gray-700/60" />
                <span className="text-[9px] text-slate-700 uppercase tracking-widest">new prompt</span>
                <div className="h-px flex-1 bg-gray-700/60" />
              </div>
            ) : (
              <EventRow key={ev.id} ev={ev} />
            ))}
          </div>
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
