"use client";

import { useEffect, useRef, useState } from "react";
import { ZoomIn, ZoomOut, RotateCcw, Copy, Check } from "lucide-react";

interface Props {
  chart: string;
}

let idCounter = 0;

export function MermaidDiagram({ chart }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const idRef = useRef(`mermaid-${++idCounter}`);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [scale, setScale] = useState(1);
  const [copied, setCopied] = useState(false);

  function copyChart() {
    const stripped = chart.replace(/rect rgb\([^)]*\)/g, "rect rgb(235, 242, 255)");
    const lightChart = `%%{init: {"theme": "default"}}%%\n${stripped}`;
    navigator.clipboard.writeText(lightChart).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  useEffect(() => {
    let cancelled = false;
    setError(null);
    setReady(false);

    import("mermaid").then(({ default: mermaid }) => {
      mermaid.initialize({
        startOnLoad: false,
        theme: "dark",
        themeVariables: {
          background: "#0f172a",
          primaryColor: "#1e3a5f",
          primaryTextColor: "#e2e8f0",
          primaryBorderColor: "#22d3ee40",
          lineColor: "#475569",
          secondaryColor: "#1e293b",
          tertiaryColor: "#1e293b",
          actorBkg: "#1e293b",
          actorBorder: "#22d3ee60",
          actorTextColor: "#e2e8f0",
          actorLineColor: "#475569",
          signalColor: "#94a3b8",
          signalTextColor: "#94a3b8",
          labelBoxBkgColor: "#0f172a",
          labelBoxBorderColor: "#334155",
          labelTextColor: "#94a3b8",
          loopTextColor: "#94a3b8",
          noteBorderColor: "#334155",
          noteBkgColor: "#1e293b",
          noteTextColor: "#94a3b8",
          activationBorderColor: "#22d3ee",
          activationBkgColor: "#1e3a5f",
        },
        sequence: {
          useMaxWidth: true,
          mirrorActors: false,
          actorMargin: 50,
          messageMargin: 15,
        },
      });

      mermaid
        .render(idRef.current, chart)
        .then(({ svg }) => {
          if (!cancelled && containerRef.current) {
            containerRef.current.innerHTML = svg;
            setReady(true);
          }
        })
        .catch((err: unknown) => {
          if (!cancelled) setError(String(err));
        });
    });

    return () => {
      cancelled = true;
    };
  }, [chart]);

  if (error) {
    return <p className="p-2 font-mono text-[10px] text-red-500">{error}</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-end gap-1">
        <button
          onClick={copyChart}
          className="flex items-center gap-1 rounded px-2 py-0.5 text-xs text-slate-400 hover:bg-gray-700/60 hover:text-slate-200 transition-colors"
          title="Copy Mermaid source"
        >
          {copied ? <Check size={12} className="text-green-400" /> : <Copy size={12} />}
          <span>{copied ? "Copied!" : "Copy"}</span>
        </button>
        <div className="w-px h-3 bg-slate-700 mx-1" />
        <button
          onClick={() => setScale((s) => Math.max(0.5, +(s - 0.25).toFixed(2)))}
          disabled={scale <= 0.5}
          className="flex items-center justify-center rounded p-1 text-slate-400 hover:bg-gray-700/60 hover:text-slate-200 disabled:opacity-30 transition-colors"
          title="Zoom out"
        >
          <ZoomOut size={14} />
        </button>
        <button
          onClick={() => setScale(1)}
          className="rounded px-2 py-0.5 text-xs text-slate-500 hover:bg-gray-700/60 hover:text-slate-200 transition-colors tabular-nums"
          title="Reset zoom"
        >
          <RotateCcw size={11} className="inline mr-1 -mt-0.5" />
          {Math.round(scale * 100)}%
        </button>
        <button
          onClick={() => setScale((s) => Math.min(2.5, +(s + 0.25).toFixed(2)))}
          disabled={scale >= 2.5}
          className="flex items-center justify-center rounded p-1 text-slate-400 hover:bg-gray-700/60 hover:text-slate-200 disabled:opacity-30 transition-colors"
          title="Zoom in"
        >
          <ZoomIn size={14} />
        </button>
      </div>
      <div
        className={`w-full overflow-auto transition-opacity duration-300 ${ready ? "opacity-100" : "opacity-0"}`}
      >
        <div
          ref={containerRef}
          className="[&_svg]:h-auto [&_svg]:w-full"
          style={{ width: `${Math.round(scale * 100)}%` }}
        />
      </div>
    </div>
  );
}
