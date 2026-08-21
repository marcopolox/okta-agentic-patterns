"use client";

import { useEffect, useRef, useState } from "react";
import { RotateCw, Server } from "lucide-react";
import { DemoEvent } from "@/lib/event-bus";
import { McpServerDef } from "@/lib/patterns";

type Status = "idle" | "success" | "error";

interface ServerState {
  status: Status;
  calledTools: Set<string>;
  failedTools: Set<string>;
  errorMsg?: string;
}

function makeInitial(servers: McpServerDef[]): Record<string, ServerState> {
  return Object.fromEntries(servers.map((s) => [s.actor, { status: "idle", calledTools: new Set(), failedTools: new Set() }]));
}

type DisplayServer = McpServerDef & { discoveredType?: string; connectionActive?: boolean };

function shortConnectionType(t: string): string {
  if (t === "IDENTITY_ASSERTION_CUSTOM_AS") return "XAA";
  if (t.toUpperCase().includes("STS")) return "STS";
  return t.split("_").pop() ?? t;
}

function typeBadgeClass(type: string): string {
  if (type === "XAA") return "bg-violet-900/40 text-violet-400";
  if (type === "STS") return "bg-sky-900/40 text-sky-400";
  return "bg-gray-800/60 text-slate-400";
}

interface DiscoveredConnection {
  label: string;
  connectionType?: string;
  active?: boolean;
  audience?: string;
  issuerUrl?: string;
}

// Authorization server ID is the last path segment of its issuer URL (.../oauth2/{asId}).
function authServerId(issuerUrl: string | undefined): string | undefined {
  return issuerUrl?.split("/").pop();
}

// A2A workload-principal ID is the last segment of the resource's ORN (orn:...:resource-servers:a2a:{wlpId}).
function workloadPrincipalId(audience: string | undefined): string | undefined {
  return audience?.startsWith("orn:") ? audience.split(":").pop() : audience;
}

interface Props {
  servers: McpServerDef[];
  events: DemoEvent[];
  resetKey?: number;
  configSource?: "okta" | "static";
  discoveredConnections?: DiscoveredConnection[];
  onRefresh?: () => void;
  refreshing?: boolean;
}

export function McpServerStatus({ servers, events, resetKey, configSource, discoveredConnections, onRefresh, refreshing }: Props) {
  const extraConns = (discoveredConnections ?? []).filter(conn =>
    !servers.some(s =>
      s.name.toLowerCase().includes(conn.label.toLowerCase()) ||
      s.actor.toLowerCase().includes(conn.label.toLowerCase()) ||
      conn.label.toLowerCase().includes(s.actor.toLowerCase())
    )
  );
  const allServers: DisplayServer[] = [
    ...servers,
    ...extraConns.map(conn => ({
      name: conn.label,
      actor: conn.label,
      tools: [] as string[],
      discoveredType: conn.connectionType,
      connectionActive: conn.active,
      resourceId: workloadPrincipalId(conn.audience),
    })),
  ];

  const [states, setStates] = useState<Record<string, ServerState>>(() => makeInitial(servers));
  const processedCountRef = useRef(0);

  useEffect(() => {
    processedCountRef.current = 0;
    setStates(makeInitial(servers));
  }, [resetKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (events.length === 0) {
      processedCountRef.current = 0;
      setStates(makeInitial(servers));
      return;
    }
    // Apply every event since the last render, not just the latest one — several can
    // land in the same batch (e.g. a denial immediately followed by the LLM's next tool
    // call), and only reacting to the trailing event silently drops the earlier ones.
    const newEvents = events.slice(processedCountRef.current);
    processedCountRef.current = events.length;
    if (newEvents.length === 0) return;

    setStates((prev) => {
      let next = prev;
      for (const ev of newEvents) {
        const server = servers.find((s) => s.actor === ev.actor);
        if (!server) continue;
        const cur = next[server.actor] ?? { status: "idle", calledTools: new Set(), failedTools: new Set() };

        if (ev.action === "called tool") {
          const calledTools = new Set(cur.calledTools);
          if (ev.target) calledTools.add(ev.target);
          next = { ...next, [server.actor]: { ...cur, status: "success", calledTools } };
        } else if (ev.action === "rejected request") {
          next = { ...next, [server.actor]: { ...cur, status: "error", errorMsg: ev.detail ?? "Request rejected by Okta" } };
        } else if (ev.action === "policy denied") {
          const failedTools = new Set(cur.failedTools);
          if (ev.target) failedTools.add(ev.target);
          next = { ...next, [server.actor]: { ...cur, status: "error", failedTools, errorMsg: ev.detail ?? "Okta policy denied" } };
        }
      }
      return next;
    });
  }, [events]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="shrink-0 rounded-xl border border-gray-700/50 bg-gray-800/60 p-3">
      <div className="mb-2.5 flex items-center justify-between">
        <span className="text-xs font-semibold tracking-wider text-cyan-400 uppercase neon-text">
          Resources
        </span>
        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={refreshing}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-slate-400 hover:text-cyan-300 hover:bg-gray-700/50 disabled:opacity-50 transition-colors"
          >
            <RotateCw size={9} className={refreshing ? "animate-spin" : ""} />
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        )}
      </div>
      <div className={`grid gap-3 ${allServers.length === 1 ? "grid-cols-1" : "grid-cols-2"}`}>
        {allServers.map((server) => {
          const state = states[server.actor] ?? { status: "idle", calledTools: new Set(), failedTools: new Set() };
          const isExtra = server.tools.length === 0 && !!server.discoveredType;

          // Determine connection type for badge
          let connectionType: string | undefined;
          let resourceId: string | undefined = server.resourceId;
          if (isExtra) {
            connectionType = server.discoveredType;
          } else {
            const match = (discoveredConnections ?? []).find(conn =>
              server.name.toLowerCase().includes(conn.label.toLowerCase()) ||
              server.actor.toLowerCase().includes(conn.label.toLowerCase()) ||
              conn.label.toLowerCase().includes(server.actor.toLowerCase())
            );
            connectionType = match?.connectionType;
            resourceId = authServerId(match?.issuerUrl) ?? resourceId;
          }

          // Determine if connection is inactive (from Okta but deactivated)
          let isConnectionActive = true;
          if (isExtra) {
            isConnectionActive = server.connectionActive !== false;
          } else if (discoveredConnections !== undefined) {
            const match = (discoveredConnections ?? []).find(conn =>
              server.name.toLowerCase().includes(conn.label.toLowerCase()) ||
              server.actor.toLowerCase().includes(conn.label.toLowerCase()) ||
              conn.label.toLowerCase().includes(server.actor.toLowerCase())
            );
            if (match) isConnectionActive = match.active !== false;
          }

          // Determine source: "okta" if found in discoveredConnections, "local" otherwise
          let sourceLabel: "Okta" | "local" | undefined;
          if (isExtra) {
            sourceLabel = "Okta";
          } else if (discoveredConnections !== undefined) {
            sourceLabel = connectionType ? "Okta" : "local";
          } else if (configSource === "okta") {
            sourceLabel = "Okta";
          } else if (configSource === "static") {
            sourceLabel = "local";
          }

          const typeLabel = connectionType ? shortConnectionType(connectionType) : undefined;

          const borderClass = !isConnectionActive
            ? "border-gray-700/30 opacity-50"
            : state.status === "success"
            ? "neon-green-border border-green-500/40"
            : state.status === "error"
            ? "neon-red-border border-red-500/40"
            : "border-gray-700/50";
          const nameColor = !isConnectionActive
            ? "text-slate-600"
            : state.status === "success"
            ? "text-green-400"
            : state.status === "error"
            ? "text-red-400"
            : "text-slate-300";
          const iconColor = !isConnectionActive
            ? "text-slate-700"
            : state.status === "success"
            ? "text-green-400"
            : state.status === "error"
            ? "text-red-400"
            : "text-slate-600";

          return (
            <div
              key={server.actor}
              className={`rounded-lg border bg-gray-900/60 p-3 transition-all duration-500 ${borderClass}`}
            >
              {/* Header */}
              <div className="mb-2 flex items-center gap-1.5">
                <Server size={11} className={`shrink-0 transition-colors duration-300 ${iconColor}`} />
                <span className={`text-xs font-semibold transition-colors duration-300 ${nameColor}`}>
                  {server.name}
                </span>
                {!isConnectionActive ? (
                  <span className="ml-auto rounded px-1 py-0.5 text-[9px] font-medium bg-gray-800/60 text-slate-600">
                    Inactive
                  </span>
                ) : state.status === "error" ? (
                  <span className="ml-auto truncate font-mono text-[9px] text-red-500">
                    ✗ denied
                  </span>
                ) : (
                  <div className="ml-auto flex items-center gap-1">
                    {sourceLabel && (
                      <span className={`rounded px-1 py-0.5 text-[9px] font-medium ${
                        sourceLabel === "Okta"
                          ? "bg-emerald-900/40 text-emerald-400"
                          : "bg-amber-900/40 text-amber-400"
                      }`}>
                        {sourceLabel}
                      </span>
                    )}
                    {typeLabel && (
                      <span className={`rounded px-1 py-0.5 text-[9px] font-medium ${typeBadgeClass(typeLabel)}`}>
                        {typeLabel}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Resource ID (authorization server ID) — cross-references with the ID shown in event details */}
              {resourceId && (
                <p className="mb-2 truncate font-mono text-[9px] text-slate-600" title={resourceId}>
                  {resourceId}
                </p>
              )}

              {/* Tool chips */}
              <div className="flex flex-wrap gap-1">
                {server.tools.map((tool) => {
                  const isToolActive = isConnectionActive && state.calledTools.has(tool);
                  const isFailed = isConnectionActive && state.failedTools?.has(tool);
                  const isServerError = isConnectionActive && state.status === "error" && !state.failedTools?.size;
                  return (
                    <span
                      key={tool}
                      className={`rounded px-1.5 py-0.5 font-mono text-[9px] transition-all duration-300 ${
                        isFailed
                          ? "bg-red-900/40 text-red-400 ring-1 ring-red-500/50"
                          : isToolActive
                          ? "bg-green-900/50 text-green-400 ring-1 ring-green-500/40"
                          : isServerError
                          ? "bg-red-900/20 text-red-700"
                          : "bg-gray-800/80 text-slate-600"
                      }`}
                    >
                      {tool}
                    </span>
                  );
                })}
              </div>

              {/* Error message */}
              {isConnectionActive && state.status === "error" && (
                <p className="mt-1.5 font-mono text-[9px] text-red-600">
                  Okta policy enforced
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
