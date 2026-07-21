"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Pattern } from "@/lib/patterns";
import { FlowDiagram } from "@/components/FlowDiagram";

interface Props {
  pattern: Pattern;
  active?: boolean;
  open: boolean;
  onClose: () => void;
}

export function ArchDiagramModal({ pattern, active = false, open, onClose }: Props) {
  const [diagramMission, setDiagramMission] = useState<1 | 2>(2);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-6 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative flex max-h-full w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-gray-700/60 bg-gray-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-gray-700/50 px-5 py-3">
          <div className="flex items-center gap-4">
            <span className="text-sm font-semibold text-cyan-400 neon-text uppercase tracking-wider">
              Architecture Diagram
            </span>
            {pattern.id === "p6" && (
              <div className="flex gap-1">
                {([1, 2] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setDiagramMission(m)}
                    className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                      diagramMission === m
                        ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                        : "text-slate-500 hover:text-slate-300"
                    }`}
                  >
                    Mission {m}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-500 transition-colors hover:bg-gray-700/50 hover:text-slate-200"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="min-h-0 flex-1 overflow-auto p-6">
          <div className="flex h-full min-h-[500px] flex-col gap-4">
            <FlowDiagram
              patternId={pattern.id}
              animate={active}
              fill
              mission={pattern.id === "p6" ? diagramMission : undefined}
            />
            {pattern.id === "p1" && (
              <div className="rounded-xl border border-cyan-500/20 bg-gray-800/60 px-5 py-4 text-sm text-slate-300 space-y-2">
                <ol className="list-decimal list-inside space-y-1 text-slate-300">
                  <li>Claude Code calls a tool on the adapter (<code className="text-cyan-400 text-xs">POST http://localhost:8008/mcp</code>)</li>
                  <li>The adapter performs XAA to get a scoped token from Okta</li>
                  <li>The adapter forwards the tool call to the real MCP server (HR or Finance) with that Bearer token</li>
                </ol>
                <p className="text-slate-400 text-xs pt-1">
                  Claude Code never talks to HR/Finance MCP servers directly — it only ever sees the adapter as a single MCP endpoint. The adapter is a transparent proxy that handles all the auth and routing. The coding assistant has no knowledge of Okta or the resource servers; it just calls tools on <code className="text-cyan-400">http://localhost:8008</code>.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
