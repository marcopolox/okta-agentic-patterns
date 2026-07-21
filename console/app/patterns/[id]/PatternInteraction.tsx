"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { LogIn, LogOut, X, ShieldOff, Loader2, Info, Play } from "lucide-react";
import { Pattern, PatternId } from "@/lib/patterns";
import { DemoEvent, subscribeToEvents } from "@/lib/event-bus";
import { ChatPanel } from "@/components/ChatPanel";
import { ConnectionGuide } from "@/components/ConnectionGuide";
import { EventStream } from "@/components/EventStream";
import { FlowDiagram } from "@/components/FlowDiagram";
import { McpServerStatus } from "@/components/McpServerStatus";
import { MermaidDiagram } from "@/components/MermaidDiagram";
import { MissionPanel, Mission } from "@/components/MissionPanel";
import { PkceChatPanel } from "@/components/PkceChatPanel";
import { DelegationPanel } from "@/components/DelegationPanel";
import { Network, GitFork, ArrowLeft, Shield, Cpu } from "lucide-react";
import type { IndustryOverrides } from "@/lib/industries";

const PRESET_PROMPTS: Partial<Record<PatternId, string[]>> = {
  p2: [
    "What products do you have available?",
    "Check stock for WirelessPro Headphones X3",
    "What's the status of order ORD-10041?",
    "Show me details for the SmartWatch Ultra 2",
  ],
  p5: [
    "What products are in your inventory?",
    "Check stock for WirelessPro Headphones X3",
    "The 4K webcam is out of stock — restock it with 100 units",
    "Add 50 units to the Portable SSD inventory",
  ],
};

type AgentServer = { label: string; connectionType?: string; active?: boolean };

function buildPresetGroups(
  patternId: PatternId,
  servers: AgentServer[],
  themeOverrides?: IndustryOverrides,
): { label: string; prompts: string[] }[] | undefined {
  if (themeOverrides?.presetGroups?.[patternId]) {
    return themeOverrides.presetGroups[patternId]!;
  }
  if (patternId === "p3") {
    // treat active===undefined as active (fallback / legacy agent)
    const live = servers.filter(s => s.active !== false);
    const hasHR = live.some(s => s.label.toLowerCase().includes("hr"));
    const hasFinance = live.some(s => s.label.toLowerCase().includes("finance"));
    const hasSlack  = live.some(s => s.label.toLowerCase().includes("slack"));
    const hasGitHub = live.some(s => s.label.toLowerCase().includes("github"));

    const groups: { label: string; prompts: string[] }[] = [];

    if (hasHR && hasFinance) {
      groups.push({
        label: "HR & Finance",
        prompts: [
          "List all employees in Engineering and show the department budget",
          "What's the total budget across all departments?",
          "Update Alice Chen's title to Principal Engineer",
          "Show the org chart and the Finance budget for the Engineering team",
        ],
      });
    } else if (hasHR) {
      groups.push({
        label: "HR",
        prompts: [
          "List all employees in Engineering",
          "Show the org chart",
          "Search for employees in the Product team",
          "Update Alice Chen's title to Principal Engineer",
        ],
      });
    } else if (hasFinance) {
      groups.push({
        label: "Finance",
        prompts: [
          "Show budget for the Engineering department",
          "List all cost centers with YTD spend",
          "Get the expense report for this quarter",
          "What's the total budget across all departments?",
        ],
      });
    }

    if (hasGitHub) {
      groups.push({
        label: "GitHub",
        prompts: [
          "List my GitHub repositories",
          ...(hasHR ? ["Search GitHub repos owned by the Engineering team"] : []),
          "Show details for a specific repo",
        ],
      });
    }

    if (hasSlack) {
      groups.push({
        label: "Slack",
        prompts: [
          ...(hasHR ? ["Post the Engineering team roster and their roles to Slack"] : []),
          ...(hasFinance ? ["Share the department budget overview on Slack"] : []),
          ...(!hasHR && !hasFinance ? ["List Slack channels in my workspace"] : []),
        ],
      });
    }

    return groups.length > 0 ? groups : undefined;
  }

  if (patternId === "p4") {
    const live = servers.filter(s => s.active !== false);
    // If no server info yet (agent not polled), fall back to static so both groups always show
    if (live.length === 0) return STATIC_PRESET_GROUPS["p4"];
    const hasGitHub = live.some(s => s.label.toLowerCase().includes("github"));
    const hasSlack  = live.some(s => s.label.toLowerCase().includes("slack"));
    const groups: { label: string; prompts: string[] }[] = [];
    if (hasGitHub) {
      groups.push({
        label: "GitHub",
        prompts: [
          "List my GitHub repositories",
          "Search GitHub repos related to authentication",
          "Show details for a specific repo",
        ],
      });
    }
    if (hasSlack) {
      groups.push({
        label: "Slack",
        prompts: [
          "List Slack channels in my workspace",
          "Show recent messages in a Slack channel",
          "Post a message to the #general channel saying hello from the Okta demo",
        ],
      });
    }
    return groups.length > 0 ? groups : undefined;
  }

  return STATIC_PRESET_GROUPS[patternId];
}

const STATIC_PRESET_GROUPS: Partial<Record<PatternId, { label: string; prompts: string[] }[]>> = {
  p4: [
    {
      label: "GitHub",
      prompts: [
        "List my GitHub repositories",
        "Search GitHub repos related to authentication",
        "Show details for a specific repo",
      ],
    },
    {
      label: "Slack",
      prompts: [
        "List Slack channels in my workspace",
        "Show recent messages in a Slack channel",
        "Post a message to the #general channel saying hello from the Okta demo",
      ],
    },
  ],
};

const MISSIONS: Partial<Record<PatternId, Mission[]>> = {
  p6: [
    {
      id: "autonomous-cc",
      title: "Autonomous Org Report",
      icon: "🤖",
      description: "The console acquires a client credentials token and invokes the orchestrator autonomously — no user login required. The orchestrator delegates to HR and Finance workers via Okta A2A delegation and posts the combined report to Slack.",
      prompt: "Run the Autonomous Org Report: delegate to the HR Worker to list all employees grouped by department, delegate to the Finance Worker to get the budget and expense summary per department, cross-reference headcount with spend to show per-department cost-per-employee ratios, then post the combined analysis to Slack.",
      scheduleLabel: "Runs nightly at midnight",
      apiRoute: "/api/p6/run-autonomous",
    },
    {
      id: "org-pulse",
      title: "Org Pulse Report",
      icon: "📊",
      description: "The orchestrator delegates to the HR and Finance worker agents via Okta agent-to-agent (A2A) delegation. Each worker validates the orchestrator's token, exchanges it for a resource-scoped token carrying an act claim, calls its MCP resource, and returns an analysis the orchestrator combines and posts to Slack.",
      prompt: "Run the Org Pulse report: delegate to the HR Worker to list all employees grouped by department, delegate to the Finance Worker to get the budget and expense summary per department, then cross-reference headcount with spend to show per-department cost-per-employee ratios, and post the combined analysis to Slack.",
      scheduleLabel: "User-initiated",
      requiresUserToken: true,
    },
  ],
};

const MERMAID_DIAGRAMS: Partial<Record<PatternId, string | { m1: string; m2: string }>> = {
  p1: `sequenceDiagram
    actor Operator
    participant Claude as Claude Code
    participant Bridge as Okta MCP Bridge
    participant Okta as Okta Org Server
    participant HR as HR MCP Server
    participant Finance as Finance MCP Server

    Note over Operator,Bridge: One-time setup
    Operator->>Claude: claude mcp add okta-demo http://localhost:8008
    Claude->>Bridge: MCP initialize (tool discovery)
    Bridge->>Okta: PKCE login — authenticate operator
    Okta-->>Bridge: id_token (operator identity)
    Bridge-->>Claude: Tool list (HR + Finance tools)

    Operator->>Claude: "How many employees are in Engineering?"
    Claude->>Bridge: POST /mcp — tools/call list_employees

    rect rgb(30, 20, 60)
        Note over Bridge,Okta: XAA — Bridge acquires scoped resource token
        Bridge->>Okta: Step 1 — id_token → ID-JAG (scope=hr:read, aud=HR auth server)
        Okta-->>Bridge: ID-JAG
        Bridge->>Okta: Step 2 — ID-JAG → access_token (jwt-bearer, HR auth server)
        Okta-->>Bridge: access_token (sub=operator, act=bridge, scope=hr:read)
    end

    Bridge->>HR: tools/call list_employees (Bearer access_token)
    HR->>Okta: Fetch JWKS (validate token)
    Okta-->>HR: Public keys
    HR-->>Bridge: Employee list
    Bridge-->>Claude: Tool result
    Claude-->>Operator: "Engineering has 12 employees"`,
  p2: `sequenceDiagram
    actor User
    participant Console as Console (P2 Chat)
    participant Agent as P2 Consumer Agent
    participant Bridge as MCP Bridge
    participant Okta as Okta
    participant Inventory as Inventory MCP Server

    User->>Console: Chat — "What products do you have?"
    Console->>Agent: POST /chat (no auth token)

    rect rgb(20, 20, 50)
        Note over Agent,Bridge: DCR — agent self-registers on first request
        Agent->>Bridge: POST /.well-known/oauth/registration
        Bridge-->>Agent: client_id + client_secret
    end

    Agent->>Bridge: POST /mcp (no token — public tools only)
    Bridge-->>Agent: Tool list (get_product_catalog)
    Agent-->>Console: Lists catalog

    User->>Console: Chat — "Check stock for Headphones X3"
    Console->>Agent: POST /chat (no auth token)
    Agent-->>Console: "[Authorize this agent] to access inventory"

    Note over User,Okta: User clicks auth link — PKCE flow via MCP Bridge
    User->>Bridge: GET /oauth/authorize?client_id={dcr_id}&code_challenge=...
    Bridge->>Okta: Proxy authorization request
    Okta-->>User: Login + consent
    User->>Okta: Authenticate
    Okta-->>Bridge: Authorization code (browser redirect)
    Bridge-->>Console: Redirect to /callback?code=...&state={pkce_state}
    Console->>Bridge: POST /oauth2/v1/token (code + code_verifier, Basic auth cid:cs)
    Bridge->>Okta: Exchange code for tokens
    Okta-->>Bridge: access_token (sub=user_email, scope=inventory:read)
    Bridge-->>Console: access_token
    Console->>Console: Store access_token in p2_access_token cookie

    User->>Console: Chat — "Check stock for Headphones X3" (after auth)
    Console->>Agent: POST /chat (Bearer access_token)
    Agent->>Bridge: POST /mcp · call_tool check_stock (Bearer access_token)
    Bridge->>Inventory: Forward call (Bearer access_token)
    Inventory->>Inventory: Validate token — sub=user_email, scope=inventory:read
    Inventory-->>Bridge: Stock result
    Bridge-->>Agent: Stock result
    Agent-->>Console: "WirelessPro Headphones X3: 47 in stock"`,
  p4: `sequenceDiagram
    actor User
    participant Console
    participant Agent as P4 Agent
    participant OktaSTS as Okta STS
    participant SaaS as Resource Server

    User->>Console: Login with Okta (auth code flow)
    Console->>Console: Store id_token in cookie

    User->>Console: Ask about GitHub or Slack
    Console->>Agent: POST /chat (Bearer id_token)
    Agent->>Agent: Build RS256 client_assertion (AI Agent key)

    Agent->>OktaSTS: token-exchange (id_token + client_assertion + resource ORN)

    alt Account not linked yet
        OktaSTS-->>Agent: 400 interaction_required + consent URL
        Agent-->>Console: Authorize [service] via Okta — link provided
        Console-->>User: Click link → SaaS OAuth consent
        User->>OktaSTS: Authorize connection
        OktaSTS-->>OktaSTS: Store SaaS refresh token
        User->>Console: Retry question
        Console->>Agent: POST /chat (Bearer id_token)
        Agent->>OktaSTS: token-exchange (id_token + client_assertion + resource ORN)
    end

    rect rgb(20, 50, 30)
        Note over OktaSTS: Account linked — issue SaaS token
        OktaSTS->>OktaSTS: Exchange stored RT → SaaS access token
        OktaSTS-->>Agent: 200 SaaS access token
    end

    Agent->>SaaS: API call (Bearer saas_token)
    SaaS-->>Agent: Result

    Agent-->>Console: Streaming response
    Console-->>User: Answer displayed`,
  p6: {
    m1: `sequenceDiagram
    participant Trigger as Event / Cron / Console
    participant Orch as P6 Orchestrator
    participant Okta as Okta (org server)
    participant HRW as HR Worker
    participant OktaHRA2A as Okta HR A2A AS
    participant OktaHR as Okta HR Auth Server
    participant HR as HR MCP Server
    participant Slack

    Note over Trigger,Orch: Autonomous — no user session required
    Trigger->>Orch: Trigger (cron / event / console button)

    rect rgb(20, 30, 60)
        Note over Orch,Okta: CC grant — orchestrator authenticates as itself
        Orch->>Okta: client_credentials (client_assertion = wlp private key)
        Okta-->>Orch: orchestrator token (sub=wlp_xxx, no user delegation)
    end

    rect rgb(30, 20, 60)
        Note over Orch,OktaHRA2A: Hop A — A2A exchange (delegation link: orchestrator → HR worker)
        Orch->>Okta: Step A1 — token-exchange (subject=orch_token, aud=HR A2A AS issuer, resource=https://hr.agent, scope=agent.invoke)
        Okta-->>Orch: ID-JAG (orchestrator identity + agent.invoke scope)
        Orch->>OktaHRA2A: Step A2 — jwt-bearer (assertion=ID-JAG)
        OktaHRA2A-->>Orch: A2A token (aud=https://hr.agent, act=orchestrator)
    end

    Orch->>HRW: POST /invoke (Bearer A2A token)
    HRW->>OktaHRA2A: validate A2A token (JWKS) — checks aud + scp=agent.invoke

    rect rgb(20, 50, 40)
        Note over HRW,OktaHR: Hop B — worker carries delegation to HR resource (two-step XAA)
        HRW->>Okta: Step B1 — token-exchange (subject=A2A token, subject_type=access_token, aud=HR AS, scope=hr:read)
        Okta-->>HRW: domain ID-JAG (hr:read embedded)
        HRW->>OktaHR: Step B2 — jwt-bearer (assertion=domain ID-JAG)
        OktaHR-->>HRW: HR resource token (aud=api:hr, act: orchestrator→worker)
    end

    HRW->>HR: list_employees / list_departments (Bearer hr_token)
    HR-->>HRW: HR data
    HRW-->>Orch: HR analysis

    Note over Orch: Finance Worker invoked same way in parallel
    Orch->>Slack: post_message (bot token)
    Slack-->>Orch: Posted ✓`,
    m2: `sequenceDiagram
    actor User
    participant Console
    participant Orch as P6 Orchestrator
    participant Okta as Okta (org server)
    participant HRW as HR Worker
    participant OktaHRA2A as Okta HR A2A AS
    participant OktaHR as Okta HR Auth Server
    participant HR as HR MCP Server
    participant Slack

    Note over User,Console: User sign-on — id_token becomes the A2A delegation subject
    User->>Console: Login with Okta
    Console->>Okta: PKCE auth code flow
    Okta-->>Console: id_token (stored in p6_id_token cookie)
    User->>Console: Run Org Pulse report
    Console->>Orch: POST /chat (Bearer id_token)

    rect rgb(30, 20, 60)
        Note over Orch,OktaHRA2A: Hop A — A2A exchange (authorized by delegation link: orchestrator → HR worker)
        Orch->>Okta: Step A1 — token-exchange (subject=id_token, aud=HR A2A AS issuer, resource=https://hr.agent, scope=agent.invoke)
        Okta-->>Orch: ID-JAG (user identity + agent.invoke scope embedded)
        Orch->>OktaHRA2A: Step A2 — jwt-bearer (assertion=ID-JAG)
        OktaHRA2A-->>Orch: A2A token (aud=https://hr.agent, act=user→orchestrator)
    end

    Orch->>HRW: POST /invoke (Bearer A2A token)
    HRW->>OktaHRA2A: validate A2A token (JWKS) — checks aud + scp=agent.invoke

    rect rgb(20, 50, 40)
        Note over HRW,OktaHR: Hop B — worker carries chain to HR resource (two-step XAA, transitive delegation)
        HRW->>Okta: Step B1 — token-exchange (subject=A2A token, subject_type=access_token, aud=HR AS, scope=hr:read)
        Okta-->>HRW: domain ID-JAG (hr:read embedded, 3-level act chain)
        HRW->>OktaHR: Step B2 — jwt-bearer (assertion=domain ID-JAG)
        OktaHR-->>HRW: HR resource token (aud=api:hr, act: user→orchestrator→worker)
    end

    HRW->>HR: list_employees / list_departments (Bearer hr_token)
    HR-->>HRW: HR data
    HRW-->>Orch: HR analysis

    Note over Orch: Finance Worker invoked same way in parallel
    Orch->>Slack: post_message (bot token)
    Slack-->>Orch: Posted ✓`,
  },
  p5: `sequenceDiagram
    actor User
    participant Console
    participant Agent as P5 Agent
    participant Okta
    participant CibaAS as Okta CIBA AS
    participant Android as Android App (CIBA)
    participant Inventory as Inventory MCP Server

    User->>Console: Login with Okta (PKCE)
    Console->>Okta: Authorization code flow
    Okta-->>Console: id_token (stored in p5_id_token cookie)

    User->>Console: "Check stock for WirelessPro Headphones X3"
    Console->>Agent: POST /chat (Bearer id_token)

    rect rgb(20, 40, 65)
        Note over Agent,Okta: XAA — read token
        Agent->>Okta: id_token → ID-JAG (org server, scope=inventory:read)
        Okta-->>Agent: ID-JAG
        Agent->>Okta: ID-JAG → resource token (inventory AS)
        Okta-->>Agent: access_token (inventory:read)
    end

    Agent->>Inventory: check_stock (Bearer read_token)
    Inventory-->>Agent: Stock data
    Agent-->>Console: "142 units in stock"

    User->>Console: "Add 50 units to WirelessPro Headphones"
    Console->>Agent: POST /chat (Bearer id_token)
    Agent-->>Console: "🔒 Approval required — push sent to your device"

    rect rgb(50, 30, 20)
        Note over Agent,Android: CIBA backchannel authentication
        Agent->>CibaAS: bc/authorize (login_hint, scope=inventory:write, binding_message)
        CibaAS->>Android: FCM push (binding_message shown to user)
        User->>Android: Approve
        Android->>CibaAS: Challenge resolved (approved)
        Agent->>CibaAS: Poll /token → access_token (inventory:write)
    end

    Agent-->>Console: "✅ Approved. Executing..."
    Agent->>Inventory: update_stock (Bearer CIBA write_token)
    Inventory-->>Agent: Stock updated
    Agent-->>Console: "Stock updated: 142 → 192"`,
  p3: `sequenceDiagram
    actor User
    participant Console
    participant Agent as P3 Agent
    participant Okta
    participant HR as HR MCP Server
    participant Finance as Finance MCP Server

    User->>Console: Login with Okta
    Console->>Okta: Authorization code flow
    Okta-->>Console: id_token (stored in cookie)

    User->>Console: Send chat message
    Console->>Agent: POST /chat (Bearer id_token)

    rect rgb(20, 40, 65)
        Note over Agent,Okta: 2-step XAA token exchange
        Agent->>Okta: id_token → ID-JAG (org server)
        Okta-->>Agent: ID-JAG token
        Agent->>Okta: ID-JAG → resource token (authz server)
        Okta-->>Agent: Access token (sub=user)
    end

    par HR tools
        Agent->>HR: POST /mcp (Bearer access_token)
        HR-->>Agent: Tool results
    and Finance tools
        Agent->>Finance: POST /mcp (Bearer access_token)
        Finance-->>Agent: Tool results
    end

    Agent-->>Console: Streaming response
    Console-->>User: Chat answer`,
};

function jwtPayload(token: string): Record<string, unknown> {
  try {
    return JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    return {};
  }
}

type DiagramModal = "architecture" | "sequence" | null;

interface Props {
  pattern: Pattern;
  active: boolean;
  userToken?: string | null;
  themeOverrides?: IndustryOverrides;
}

export function PatternInteraction({ pattern, active, userToken, themeOverrides }: Props) {
  const [events, setEvents] = useState<DemoEvent[]>([]);
  const [openDiagram, setOpenDiagram] = useState<DiagramModal>(null);
  const [openVideo, setOpenVideo] = useState<{ title: string; url: string } | null>(null);
  const [mcpResetKey, setMcpResetKey] = useState(0);
  const [revoking, setRevoking] = useState(false);
  const [tokenRevoked, setTokenRevoked] = useState(false);
  const [selectedMissionId, setSelectedMissionId] = useState<string | null>(null);
  const [diagramMission, setDiagramMission] = useState<1 | 2>(2);
  const [agentLoadState, setAgentLoadState] = useState<"loading" | "ready" | "fallback" | "unknown">(
    pattern.hasAgentStatus ? "loading" : "unknown"
  );
  const [agentLoadMessage, setAgentLoadMessage] = useState<string>(
    pattern.hasAgentStatus ? "Fetching connections from Okta..." : ""
  );
  const [agentLoadServers, setAgentLoadServers] = useState<{ label: string; audience?: string; connectionType?: string; active?: boolean }[]>([]);
  const displayServers = (pattern.mcpServers ?? []).map((s) => ({
    ...s,
    name: themeOverrides?.serverNameOverrides?.[s.actor] ?? s.name,
  }));
  const [refreshing, setRefreshing] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      const res = await fetch(`/api/status/${pattern.id}`, { method: "POST" });
      if (res.ok) {
        const data = await res.json();
        if (data.servers) setAgentLoadServers(data.servers);
        if (data.state) setAgentLoadState(data.state);
        if (data.message) setAgentLoadMessage(data.message);
      }
    } catch { /* ignore */ }
    setRefreshing(false);
  }

  async function handleRevoke() {
    setRevoking(true);
    const res = await fetch("/api/auth/revoke/p4", { method: "POST" });
    setRevoking(false);
    if (res.ok) setTokenRevoked(true);
  }

  useEffect(() => {
    const unsubscribe = subscribeToEvents(
      pattern.id,
      (ev) => setEvents((prev) => prev.some(e => e.id === ev.id) ? prev : [...prev.slice(-199), ev]),
      () => setEvents([]),
    );
    return unsubscribe;
  }, [pattern.id]);

  // Close modal / popover on Escape
  useEffect(() => {
    if (!openDiagram && !infoOpen && !openVideo) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpenDiagram(null);
        setInfoOpen(false);
        setOpenVideo(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [openDiagram, infoOpen, openVideo]);

  // Poll agent /status until it leaves "loading" state (only for patterns with hasAgentStatus)
  useEffect(() => {
    if (!pattern.hasAgentStatus) return;
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch(`/api/status/${pattern.id}`);
        if (!res.ok) { if (!cancelled) setTimeout(poll, 1000); return; }
        const data = await res.json();
        if (cancelled) return;
        if (data.message) setAgentLoadMessage(data.message);
        if (data.servers) setAgentLoadServers(data.servers);
        if (data.state !== "loading") { setAgentLoadState(data.state); return; }
        setTimeout(poll, 500);
      } catch { if (!cancelled) setTimeout(poll, 1000); }
    }
    poll();
    return () => { cancelled = true; };
  }, [pattern.hasAgentStatus, pattern.id]);

  const mermaidEntry = MERMAID_DIAGRAMS[pattern.id];
  const hasMermaid = !!mermaidEntry;
  function getMermaidChart(mission: 1 | 2): string {
    if (!mermaidEntry) return "";
    if (typeof mermaidEntry === "string") return mermaidEntry;
    return mission === 1 ? mermaidEntry.m1 : mermaidEntry.m2;
  }
  const p6HasMissions = pattern.id === "p6" && typeof mermaidEntry === "object";

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">

      {/* Compact header bar */}
      <div className="shrink-0 flex items-center gap-2 min-w-0">
        <Link
          href="/"
          className="shrink-0 flex items-center gap-1 text-xs text-slate-500 hover:text-cyan-400 transition-colors mr-1"
        >
          <ArrowLeft size={12} />
          <span>All patterns</span>
        </Link>
        <span className="font-mono text-xs font-semibold tracking-widest text-cyan-400 uppercase neon-text shrink-0">
          {pattern.id}
        </span>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
          active ? "bg-emerald-500/15 text-emerald-400" : "bg-gray-700/60 text-slate-500"
        }`}>
          {active ? "Active" : "Inactive"}
        </span>
        <div className="min-w-0 flex-1 flex items-baseline gap-2 overflow-hidden">
          <span className="text-sm font-bold text-white truncate shrink-0">{pattern.title}</span>
          <span className="text-xs text-slate-500 truncate hidden md:block">{pattern.subtitle}</span>
        </div>
        {/* Info popover */}
        <div className="relative shrink-0">
          <button
            onClick={() => setInfoOpen((o) => !o)}
            className={`flex items-center rounded p-1 transition-colors ${
              infoOpen ? "text-cyan-300 bg-gray-700/50" : "text-slate-500 hover:text-cyan-300 hover:bg-gray-700/50"
            }`}
          >
            <Info size={13} />
          </button>
          {infoOpen && (
            <div className="absolute right-0 top-full z-40 mt-1 w-72 rounded-xl border border-gray-700/60 bg-gray-900 p-4 shadow-xl">
              <p className="text-xs text-slate-300 mb-3">{pattern.description}</p>
              <div className="flex flex-wrap gap-2">
                <span className="flex items-center gap-1 rounded border border-cyan-500/20 bg-cyan-500/5 px-2 py-1 text-xs text-cyan-300">
                  <Cpu size={10} />{pattern.agentType}
                </span>
                <span className="flex items-center gap-1 rounded border border-cyan-500/20 bg-cyan-500/5 px-2 py-1 text-xs text-cyan-300">
                  <Shield size={10} />{pattern.authFlow}
                </span>
              </div>
            </div>
          )}
        </div>
        <button
          onClick={() => setOpenDiagram("architecture")}
          className="shrink-0 flex items-center gap-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1.5 text-xs font-medium text-cyan-300 transition-colors hover:bg-cyan-500/20"
        >
          <Network size={11} />
          Architecture
        </button>
        {hasMermaid && (
          <button
            onClick={() => setOpenDiagram("sequence")}
            className="shrink-0 flex items-center gap-1.5 rounded-lg border border-violet-500/30 bg-violet-500/10 px-2.5 py-1.5 text-xs font-medium text-violet-300 transition-colors hover:bg-violet-500/20"
          >
            <GitFork size={11} />
            Sequence
          </button>
        )}
      </div>

      {/* Two-column layout */}
      <div className="flex min-h-0 flex-1 gap-5">

        {/* Column 1: Interaction panel */}
        <div className="flex min-h-0 flex-1 flex-col gap-2">
          {pattern.rightPanel === "connection-guide" && (
            <ConnectionGuide
              adapterUrl={pattern.agentUrl ?? "http://localhost:8000"}
              active={active}
              variant={pattern.id === "p2" ? "consumer-agent" : "developer-tools"}
            />
          )}
          {pattern.rightPanel === "chat" && pattern.requiresUserToken && !userToken && (
            <UserLoginGate pattern={pattern} active={active} />
          )}
          {pattern.rightPanel === "chat" && (!pattern.requiresUserToken || userToken) && (
            agentLoadState === "loading" ? (
              <AgentLoadingScreen message={agentLoadMessage} />
            ) : (
              <ChatPanel
                key={userToken ?? "anonymous"}
                agentUrl={pattern.agentUrl ?? ""}
                patternId={pattern.id}
                disabled={!active}
                disabledReason={`Start this pattern: docker compose --profile ${pattern.id} up`}
                presetPrompts={themeOverrides?.presetPrompts?.[pattern.id] ?? PRESET_PROMPTS[pattern.id]}
                presetGroups={buildPresetGroups(pattern.id, agentLoadServers, themeOverrides)}
                userToken={userToken ?? undefined}
                preserveSessionOnNavigation={pattern.id === "p2"}
                authStatus={
                  <>
                    {userToken ? (
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-400">
                          Logged in as <span className="font-medium text-cyan-400">{(jwtPayload(userToken).name ?? jwtPayload(userToken).email ?? "User") as string}</span>
                        </span>
                        <div className="flex items-center gap-2">
                          {pattern.id === "p4" && (
                            <button
                              onClick={handleRevoke}
                              disabled={revoking || tokenRevoked}
                              className="flex items-center gap-1 rounded px-2 py-0.5 text-xs text-red-400 hover:bg-red-500/10 disabled:opacity-50 transition-colors"
                            >
                              {revoking ? <Loader2 size={10} className="animate-spin" /> : <ShieldOff size={10} />}
                              {tokenRevoked ? "Access Revoked" : "Revoke Access"}
                            </button>
                          )}
                          <a
                            href={`/api/auth/logout/${pattern.id}`}
                            className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300"
                          >
                            <LogOut size={11} />
                            Logout
                          </a>
                        </div>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-500">Not authenticated</span>
                    )}
                  </>
                }
                onMessageSent={() => {
                  setMcpResetKey((k) => k + 1);
                  setEvents((prev) => {
                    if (prev.length === 0) return prev;
                    return [...prev, {
                      id: `sep-${Date.now()}`,
                      patternId: pattern.id,
                      timestamp: new Date().toISOString(),
                      actor: "", action: "", target: "",
                      level: "separator",
                    }];
                  });
                }}
              />
            )
          )}
          {pattern.rightPanel === "mission" && pattern.requiresUserToken && !userToken && (
            <UserLoginGate pattern={pattern} active={active} />
          )}
          {pattern.rightPanel === "mission" && (!pattern.requiresUserToken || userToken) && (
            <div className="flex min-h-0 flex-1 flex-col gap-2">
              {userToken && (
                <div className="flex shrink-0 items-center justify-between rounded-lg border border-gray-700/50 bg-gray-800/40 px-3 py-1.5">
                  <span className="text-xs text-slate-400">
                    Logged in as <span className="font-medium text-cyan-400">{(jwtPayload(userToken).name ?? jwtPayload(userToken).email ?? "User") as string}</span>
                  </span>
                  <a
                    href={`/api/auth/logout/${pattern.id}`}
                    className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-300"
                  >
                    <LogOut size={11} />
                    Logout
                  </a>
                </div>
              )}
              <MissionPanel
                agentUrl={pattern.agentUrl ?? ""}
                patternId={pattern.id}
                disabled={!active}
                disabledReason={`docker compose --profile ${pattern.id} up`}
                missions={MISSIONS[pattern.id] ?? []}
                userToken={userToken ?? undefined}
                selectedMissionId={selectedMissionId}
                onMissionSelect={setSelectedMissionId}
                resourcesSlot={
                  selectedMissionId && (pattern.mcpServers?.length || agentLoadServers.length > 0) ? (
                    <McpServerStatus
                      servers={displayServers}
                      events={events}
                      resetKey={mcpResetKey}
                      configSource={
                        agentLoadState === "ready" ? "okta" :
                        agentLoadState === "fallback" ? "static" :
                        undefined
                      }
                      discoveredConnections={agentLoadState !== "unknown" ? agentLoadServers : undefined}
                      onRefresh={pattern.hasAgentStatus ? handleRefresh : undefined}
                      refreshing={refreshing}
                    />
                  ) : undefined
                }
              />
            </div>
          )}
          {pattern.rightPanel === "pkce-chat" && (
            <PkceChatPanel pattern={pattern} active={active} />
          )}
          {pattern.rightPanel === "delegation" && pattern.requiresUserToken && !userToken && (
            <UserLoginGate pattern={pattern} active={active} />
          )}
          {pattern.rightPanel === "delegation" && (!pattern.requiresUserToken || userToken) && (
            <div className="flex min-h-0 flex-1 flex-col gap-2">
              <div className="shrink-0">
                <DelegationPanel userToken={userToken ?? null} compact />
              </div>
              <div className="flex min-h-0 flex-1 flex-col">
                <ChatPanel
                  key={userToken ?? "anonymous"}
                  agentUrl={pattern.agentUrl ?? ""}
                  patternId={pattern.id}
                  disabled={!active}
                  disabledReason={`Start this pattern: docker compose --profile ${pattern.id} up`}
                  presetPrompts={PRESET_PROMPTS[pattern.id]}
                  userToken={userToken ?? undefined}
                  authStatus={
                    userToken ? (
                      <div className="flex items-center justify-between px-3 py-1.5 border-b border-gray-700/40 bg-gray-900/40">
                        <div className="flex items-center gap-1.5">
                          <Shield size={11} className="text-violet-400" />
                          <span className="text-xs text-slate-400">Logged in · XAA + FGA active</span>
                        </div>
                        <a href="/api/auth/logout/p7" className="text-[10px] text-slate-500 hover:text-slate-300 transition-colors">
                          Log out
                        </a>
                      </div>
                    ) : undefined
                  }
                  onMessageSent={() => { setMcpResetKey(k => k + 1); }}
                />
              </div>
            </div>
          )}
          {pattern.rightPanel === "videos" && (
            <div className="grid min-h-0 flex-1 content-start grid-cols-1 gap-4 overflow-y-auto sm:grid-cols-4">
              {(pattern.platforms ?? []).map((platform) => (
                <div
                  key={platform.label}
                  className="flex flex-col overflow-hidden rounded-xl border border-gray-700/50 bg-gray-800/40 neon-card self-start"
                >
                  {platform.videoUrls && platform.videoUrls.length > 0 ? (
                    <div className="flex flex-col divide-y divide-gray-700/40">
                      {platform.videoUrls.map((v) => (
                        <VideoThumbnail
                          key={v.label}
                          src={v.url}
                          label={v.label}
                          onClick={() => setOpenVideo({ title: v.label, url: v.url })}
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="flex aspect-video items-center justify-center bg-gray-900/80 text-xs text-slate-500">
                      Video coming soon
                    </div>
                  )}
                  <div className="p-3 text-center text-sm font-medium text-slate-300">
                    {platform.label}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Column 2: MCP servers (non-mission panels) + auth events */}
        {pattern.rightPanel !== "videos" && (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          {pattern.rightPanel !== "mission" && (pattern.mcpServers && pattern.mcpServers.length > 0 || agentLoadServers.length > 0) && (
            <McpServerStatus
              servers={pattern.mcpServers ?? []}
              events={events}
              resetKey={mcpResetKey}
              configSource={
                agentLoadState === "ready" ? "okta" :
                agentLoadState === "fallback" ? "static" :
                undefined
              }
              discoveredConnections={agentLoadState !== "unknown" ? agentLoadServers : undefined}
              onRefresh={pattern.hasAgentStatus ? handleRefresh : undefined}
              refreshing={refreshing}
            />
          )}
          <div className="min-h-0 flex-1">
            <EventStream events={events} onClear={() => setEvents([])} />
          </div>
        </div>
        )}

      </div>

      {/* Diagram modal */}
      {openDiagram && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm"
          onClick={() => setOpenDiagram(null)}
        >
          <div
            className="absolute inset-0 flex flex-col overflow-hidden bg-gray-900 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex shrink-0 items-center justify-between border-b border-gray-700/50 px-5 py-3">
              <div className="flex items-center gap-4">
                <span className="text-sm font-semibold text-cyan-400 neon-text uppercase tracking-wider">
                  {openDiagram === "architecture" ? "Architecture Diagram" : "Sequence Diagram"}
                </span>
                {p6HasMissions && (
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
                onClick={() => setOpenDiagram(null)}
                className="rounded-lg p-1 text-slate-500 transition-colors hover:bg-gray-700/50 hover:text-slate-200"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal content */}
            <div className="min-h-0 flex-1 overflow-auto p-6">
              {openDiagram === "architecture" && (
                <div className="flex h-full min-h-[75vh] flex-col gap-4">
                  <FlowDiagram patternId={pattern.id} animate={active} fill mission={pattern.id === "p6" ? diagramMission : undefined} />
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
              )}
              {openDiagram === "sequence" && hasMermaid && (
                <MermaidDiagram chart={getMermaidChart(diagramMission)} />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Video modal */}
      {openVideo && (
        <div
          className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm"
          onClick={() => setOpenVideo(null)}
        >
          <div
            className="absolute inset-0 flex flex-col overflow-hidden bg-gray-900 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header */}
            <div className="flex shrink-0 items-center justify-between border-b border-gray-700/50 px-5 py-3">
              <span className="text-sm font-semibold text-cyan-400 neon-text uppercase tracking-wider">
                {openVideo.title}
              </span>
              <button
                onClick={() => setOpenVideo(null)}
                className="rounded-lg p-1 text-slate-500 transition-colors hover:bg-gray-700/50 hover:text-slate-200"
              >
                <X size={16} />
              </button>
            </div>

            {/* Modal content */}
            <div className="flex min-h-0 flex-1">
              <video src={openVideo.url} controls autoPlay className="h-full w-full bg-black" />
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

function VideoThumbnail({ src, label, onClick }: { src: string; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="relative w-full overflow-hidden group">
      <video
        src={src}
        preload="metadata"
        muted
        playsInline
        className="w-full aspect-video object-cover bg-gray-900"
        onLoadedMetadata={(e) => { (e.target as HTMLVideoElement).currentTime = 0.5; }}
      />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="rounded-full bg-black/60 p-3 backdrop-blur-sm">
          <Play size={20} className="text-white fill-white" />
        </div>
        <span className="text-xs font-medium text-white drop-shadow px-2 text-center">{label}</span>
      </div>
    </button>
  );
}

function AgentLoadingScreen({ message }: { message: string }) {
  return (
    <div className="flex h-full items-center justify-center rounded-xl border border-gray-700/50 bg-gray-800/60">
      <div className="flex flex-col items-center gap-4 p-8 text-center">
        <Loader2 size={28} className="animate-spin text-cyan-400" />
        <p className="text-sm font-medium text-slate-300">Loading resources from Okta…</p>
        {message && <p className="max-w-xs text-xs text-slate-500">{message}</p>}
      </div>
    </div>
  );
}

function UserLoginGate({ pattern, active }: { pattern: Pattern; active: boolean }) {
  function login() {
    window.location.href = `/api/auth/start/${pattern.id}`;
  }

  if (!active) {
    return (
      <div className="flex h-full items-center justify-center rounded-xl border border-gray-700/50 bg-gray-800/60 p-6 text-center">
        <div>
          <p className="mb-2 text-sm text-slate-500">Pattern {pattern.id.toUpperCase()} not running</p>
          <code className="text-xs text-slate-600">
            docker compose --profile {pattern.id} up
          </code>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 rounded-xl border border-gray-700/50 bg-gray-800/60 p-6 text-center neon-border">
      <p className="text-sm text-slate-400">
        Log in with your Okta account to let the agent act on your behalf.
      </p>
      <button
        onClick={login}
        className="flex items-center gap-2 rounded-lg border border-cyan-500/40 bg-cyan-500/20 px-4 py-2 text-sm font-medium text-cyan-300 hover:bg-cyan-500/30 neon-btn"
      >
        <LogIn size={14} />
        Login with Okta
      </button>
    </div>
  );
}
