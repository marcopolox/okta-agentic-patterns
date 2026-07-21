"use client";

import { useState, useRef, useEffect } from "react";
import { Play, Clock, Loader2, Lock, LogIn } from "lucide-react";
import { PatternId } from "@/lib/patterns";

export interface Mission {
  id: string;
  title: string;
  description: string;
  icon: string;
  prompt: string;
  scheduleLabel: string;
  blockedReason?: string;
  apiRoute?: string;       // if set, POST to this Next.js API route instead of ${agentUrl}/chat
  requiresUserToken?: boolean; // if true, show a login gate when no userToken is available
}

interface MissionPanelProps {
  agentUrl: string;
  patternId: PatternId;
  disabled: boolean;
  disabledReason: string;
  missions: Mission[];
  userToken?: string;
  selectedMissionId: string | null;
  onMissionSelect: (id: string | null) => void;
  resourcesSlot?: React.ReactNode;
  onRunStart?: () => void;
}

export function MissionPanel({
  agentUrl,
  patternId,
  disabled,
  disabledReason,
  missions,
  userToken,
  selectedMissionId,
  onMissionSelect,
  resourcesSlot,
  onRunStart,
}: MissionPanelProps) {
  const [runningId, setRunningId] = useState<string | null>(null);
  const [result, setResult] = useState<string>("");
  const [lastRanId, setLastRanId] = useState<string | null>(null);
  const sessionId = useRef(`${patternId}-${Date.now()}`);
  const resultEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    resultEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [result]);

  async function runMission(mission: Mission) {
    if (runningId || disabled) return;
    setRunningId(mission.id);
    setResult("");
    setLastRanId(mission.id);
    onRunStart?.();

    try {
      const url = mission.apiRoute ?? `${agentUrl}/chat`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(!mission.apiRoute && userToken ? { Authorization: `Bearer ${userToken}` } : {}),
        },
        body: JSON.stringify({ message: mission.prompt, session_id: sessionId.current }),
      });

      if (!res.ok || !res.body) {
        setResult(`Error: HTTP ${res.status}`);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        setResult(accumulated);
      }
    } catch (err) {
      setResult(`Error: ${err instanceof Error ? err.message : "Unknown error"}`);
    } finally {
      setRunningId(null);
    }
  }

  if (disabled) {
    return (
      <div className="flex h-full items-center justify-center rounded-xl border border-gray-700/50 bg-gray-800/60 p-6 text-center">
        <div>
          <p className="mb-2 text-sm text-slate-500">Agent not running</p>
          <code className="text-xs text-slate-600">{disabledReason}</code>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* Mission cards */}
      <div className="grid shrink-0 grid-cols-2 gap-3">
        {missions.map((mission, idx) => {
          const isSelected = selectedMissionId === mission.id;
          const isRunning = runningId === mission.id;
          const isOtherRunning = runningId !== null && runningId !== mission.id;
          const isOtherSelected = selectedMissionId !== null && !isSelected;
          const missionLabel = `Mission ${idx + 1}`;

          if (mission.blockedReason !== undefined) {
            return (
              <div
                key={mission.id}
                className="flex flex-col gap-3 rounded-xl border border-gray-700/30 bg-gray-800/20 p-4 opacity-60"
              >
                <div className="flex items-center justify-between">
                  <span className="rounded-md bg-gray-700/40 px-2 py-0.5 font-mono text-[10px] font-semibold tracking-widest text-slate-500 uppercase">
                    {missionLabel}
                  </span>
                  <span className="flex items-center gap-1 rounded-md bg-amber-900/30 px-2 py-0.5 text-[10px] font-medium text-amber-500">
                    <Lock size={9} />
                    Blocked
                  </span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-2xl leading-none grayscale">{mission.icon}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-400">{mission.title}</p>
                    <p className="mt-0.5 text-xs text-slate-600">{mission.description}</p>
                  </div>
                </div>
                {mission.blockedReason && (
                  <p className="text-xs text-amber-600/80 leading-relaxed">{mission.blockedReason}</p>
                )}
                <button
                  disabled
                  className="mt-auto flex w-full items-center justify-center gap-2 rounded-lg border border-gray-700/30 bg-gray-700/20 py-2 text-xs font-medium text-slate-600 cursor-not-allowed"
                >
                  <Lock size={12} />
                  Unavailable
                </button>
              </div>
            );
          }

          return (
            <div
              key={mission.id}
              onClick={() => {
                if (runningId) return;
                onMissionSelect(isSelected ? null : mission.id);
              }}
              className={`flex flex-col gap-3 rounded-xl border p-4 transition-all cursor-pointer ${
                isRunning
                  ? "border-cyan-500/40 bg-cyan-500/10"
                  : isSelected
                  ? "border-cyan-500/50 bg-cyan-500/5 ring-1 ring-cyan-500/25"
                  : isOtherRunning || isOtherSelected
                  ? "border-gray-700/30 bg-gray-800/20 opacity-50"
                  : "border-gray-700/50 bg-gray-800/40 hover:border-gray-600/60 hover:bg-gray-800/60"
              }`}
            >
              {/* Mission label badge */}
              <div className="flex items-center justify-between">
                <span className={`rounded-md px-2 py-0.5 font-mono text-[10px] font-semibold tracking-widest uppercase ${
                  isSelected ? "bg-cyan-500/20 text-cyan-400" : "bg-gray-700/60 text-slate-500"
                }`}>
                  {missionLabel}
                </span>
                {isSelected && !isRunning && (
                  <span className="text-[10px] text-cyan-500/70">selected</span>
                )}
              </div>

              {/* Card header */}
              <div className="flex items-start gap-2">
                <span className="text-2xl leading-none">{mission.icon}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-200">{mission.title}</p>
                  <p className="mt-0.5 text-xs text-slate-500">{mission.description}</p>
                </div>
              </div>

              {/* Schedule label */}
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <Clock size={10} />
                <span>{mission.scheduleLabel}</span>
              </div>

              {/* Run button — only shown when this card is selected */}
              {isSelected && (
                mission.requiresUserToken && !userToken ? (
                  <a
                    href={`/api/auth/start/${patternId}`}
                    onClick={(e) => e.stopPropagation()}
                    className="mt-auto flex w-full items-center justify-center gap-2 rounded-lg border border-blue-500/30 bg-blue-500/10 py-2 text-xs font-medium text-blue-400 hover:bg-blue-500/20 transition-colors"
                  >
                    <LogIn size={12} />
                    Login to Run
                  </a>
                ) : (
                  <button
                    onClick={(e) => { e.stopPropagation(); runMission(mission); }}
                    disabled={!!runningId}
                    className={`mt-auto flex w-full items-center justify-center gap-2 rounded-lg py-2 text-xs font-medium transition-all ${
                      isRunning
                        ? "border border-cyan-500/40 bg-cyan-500/20 text-cyan-300 cursor-not-allowed"
                        : "border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 hover:border-emerald-500/50"
                    }`}
                  >
                    {isRunning ? (
                      <>
                        <Loader2 size={12} className="animate-spin" />
                        Running…
                      </>
                    ) : (
                      <>
                        <Play size={12} />
                        Run
                      </>
                    )}
                  </button>
                )
              )}
            </div>
          );
        })}
      </div>

      {/* Resources — rendered inline after mission selection */}
      {resourcesSlot && (
        <div className="shrink-0">
          {resourcesSlot}
        </div>
      )}

      {/* Results area */}
      {(result || runningId) && (
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden rounded-xl border border-gray-700/50 bg-gray-900/60 p-4">
          {lastRanId && (
            <div className="mb-3 flex items-center gap-2 border-b border-gray-700/40 pb-2">
              <span className="text-xs font-medium text-slate-500">
                {missions.find((m) => m.id === lastRanId)?.title ?? "Mission"}
              </span>
              {runningId && (
                <span className="flex items-center gap-1 text-xs text-cyan-400">
                  <Loader2 size={10} className="animate-spin" />
                  running…
                </span>
              )}
            </div>
          )}
          <pre className="whitespace-pre-wrap break-words text-xs text-slate-300 font-sans">
            {result || " "}
          </pre>
          {runningId && (
            <div className="mt-2 flex items-center gap-1">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="inline-block h-1.5 w-1.5 rounded-full bg-cyan-400 opacity-70 animate-bounce"
                  style={{ animationDelay: `${i * 150}ms` }}
                />
              ))}
            </div>
          )}
          <div ref={resultEndRef} />
        </div>
      )}
    </div>
  );
}
