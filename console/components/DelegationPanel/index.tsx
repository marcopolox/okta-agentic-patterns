"use client";

import { useState, useEffect, useCallback } from "react";
import { ShieldCheck, Loader2 } from "lucide-react";

const HR_TOOLS = [
  { name: "list_employees", label: "List Employees" },
  { name: "update_employee_title", label: "Update Title" },
];

const FINANCE_TOOLS = [
  { name: "get_budget", label: "Get Budget" },
  { name: "list_invoices", label: "List Invoices" },
];

interface Props {
  userToken: string | null;
  compact?: boolean;
}

export function DelegationPanel({ userToken, compact }: Props) {
  const [delegations, setDelegations] = useState<Record<string, boolean>>({});
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDelegations = useCallback(async () => {
    if (!userToken) return;
    try {
      const res = await fetch("/api/p7/delegations", {
        headers: { Authorization: `Bearer ${userToken}` },
      });
      if (res.ok) {
        const data = await res.json() as Record<string, boolean>;
        setDelegations(data);
        setError(null);
      } else {
        setError(`${res.status}: ${res.statusText}`);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, [userToken]);

  useEffect(() => {
    fetchDelegations();
  }, [fetchDelegations]);

  async function toggleTool(tool: string, currentValue: boolean) {
    if (pending.has(tool)) return;
    setPending((p) => new Set(p).add(tool));
    // Optimistic update
    setDelegations((prev) => ({ ...prev, [tool]: !currentValue }));

    try {
      const method = currentValue ? "DELETE" : "POST";
      const res = await fetch("/api/p7/delegations", {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${userToken}`,
        },
        body: JSON.stringify({ tool }),
      });
      if (!res.ok) {
        // Revert on failure
        setDelegations((prev) => ({ ...prev, [tool]: currentValue }));
      }
    } catch {
      setDelegations((prev) => ({ ...prev, [tool]: currentValue }));
    } finally {
      setPending((p) => { const next = new Set(p); next.delete(tool); return next; });
    }
  }

  if (!userToken) {
    if (compact) {
      return (
        <div className="flex items-center gap-2 rounded-xl border border-gray-700/50 bg-gray-800/30 px-3 py-2">
          <ShieldCheck size={13} className="text-slate-500" />
          <span className="text-xs text-slate-500">Log in to manage tool delegations</span>
        </div>
      );
    }
    return (
      <div className="flex h-full flex-col items-center justify-center rounded-xl border border-gray-700/50 bg-gray-800/30 p-6">
        <ShieldCheck size={24} className="mb-3 text-slate-500" />
        <p className="text-center text-xs text-slate-500">Log in to manage tool delegations</p>
      </div>
    );
  }

  const grantsActive = Object.values(delegations).filter(Boolean).length;

  if (compact) {
    return (
      <div className="rounded-xl border border-gray-700/50 bg-gray-800/30 px-3 py-2 space-y-2">
        <div className="flex items-center gap-2">
          <ShieldCheck size={13} className="text-violet-400" />
          <span className="text-xs font-semibold text-slate-300">FGA Delegations</span>
          <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-[10px] font-medium text-violet-300">
            {loading ? "…" : grantsActive} active
          </span>
          {loading && <Loader2 size={10} className="animate-spin text-slate-500" />}
          {error && <span className="text-[10px] text-red-400">{error}</span>}
        </div>
        {!loading && !error && (
          <div className="space-y-1.5">
            <CompactToolRow label="HR" tools={HR_TOOLS} delegations={delegations} pending={pending} onToggle={toggleTool} />
            <CompactToolRow label="Finance" tools={FINANCE_TOOLS} delegations={delegations} pending={pending} onToggle={toggleTool} />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-gray-700/50 bg-gray-800/30">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between border-b border-gray-700/40 px-3 py-2">
        <div className="flex items-center gap-2">
          <ShieldCheck size={13} className="text-violet-400" />
          <span className="text-xs font-semibold text-slate-300">FGA Delegations</span>
        </div>
        <span className="rounded-full bg-violet-500/15 px-2 py-0.5 text-xs font-medium text-violet-300">
          {loading ? "…" : grantsActive} active
        </span>
      </div>

      {/* Tool groups */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 size={16} className="animate-spin text-slate-500" />
          </div>
        ) : error ? (
          <p className="text-xs text-red-400 px-1">{error}</p>
        ) : (
          <>
            <ToolGroup label="HR Tools" tools={HR_TOOLS} delegations={delegations} pending={pending} onToggle={toggleTool} />
            <ToolGroup label="Finance Tools" tools={FINANCE_TOOLS} delegations={delegations} pending={pending} onToggle={toggleTool} />
          </>
        )}
      </div>
    </div>
  );
}

interface ToolGroupProps {
  label: string;
  tools: { name: string; label: string }[];
  delegations: Record<string, boolean>;
  pending: Set<string>;
  onToggle: (tool: string, current: boolean) => void;
}

function CompactToolRow({ label, tools, delegations, pending, onToggle }: ToolGroupProps) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 w-12 shrink-0">{label}</span>
      {tools.map((tool) => {
        const granted = delegations[tool.name] ?? false;
        const isPending = pending.has(tool.name);
        return (
          <button
            key={tool.name}
            onClick={() => onToggle(tool.name, granted)}
            disabled={isPending}
            className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium transition-all border disabled:opacity-50 ${
              granted
                ? "bg-violet-500/20 border-violet-500/40 text-violet-300 hover:bg-violet-500/30"
                : "bg-gray-800/60 border-gray-700/40 text-slate-500 hover:text-slate-300 hover:border-gray-600/60"
            }`}
          >
            {isPending
              ? <Loader2 size={7} className="animate-spin" />
              : <span className={`h-1.5 w-1.5 rounded-full ${granted ? "bg-violet-400" : "bg-gray-600"}`} />
            }
            {tool.label}
          </button>
        );
      })}
    </div>
  );
}

function ToolGroup({ label, tools, delegations, pending, onToggle }: ToolGroupProps) {
  return (
    <div>
      <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <div className="space-y-1.5">
        {tools.map((tool) => {
          const granted = delegations[tool.name] ?? false;
          const isPending = pending.has(tool.name);
          return (
            <div
              key={tool.name}
              className="flex items-center justify-between rounded-lg border border-gray-700/40 bg-gray-900/40 px-2.5 py-1.5"
            >
              <span className="text-xs text-slate-300">{tool.label}</span>
              <button
                onClick={() => onToggle(tool.name, granted)}
                disabled={isPending}
                className={`relative h-5 w-9 shrink-0 rounded-full transition-colors focus:outline-none disabled:opacity-50 ${
                  granted ? "bg-violet-500" : "bg-gray-700"
                }`}
                aria-checked={granted}
                role="switch"
              >
                <span
                  className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
                    granted ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
