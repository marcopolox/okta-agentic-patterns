export type PatternId = "p1" | "p2" | "p3" | "p4" | "p5" | "p6" | "p7" | "p8";

export interface McpServerDef {
  name: string;   // display name shown in the UI
  actor: string;  // matches event.actor emitted by that server
  tools: string[]; // tool names, shown as chips
}

export interface PlatformLink {
  label: string;
  videoUrls?: Array<{ label: string; url: string }>; // shown in a full-screen popup on the pattern detail page
  diagramUrl?: string;  // linked from a button on the landing page card
}

export interface Pattern {
  id: PatternId;
  title: string;
  subtitle: string;
  description: string;
  agentType: string;
  authFlow: string;
  badge?: string; // short label shown as a chip on the card (e.g. "XAA", "STS")
  requiresAdapter: boolean;
  agentUrl: string | null; // null = not yet implemented
  agentHealthUrl?: string; // server-side health check URL (may differ from agentUrl when agent runs on host)
  rightPanel: "connection-guide" | "chat" | "pkce-chat" | "mission" | "videos" | "delegation";
  requiresUserToken?: boolean; // when true, PatternInteraction shows a login gate before the chat panel
  hasAgentStatus?: boolean; // when true, PatternInteraction polls GET /status before showing chat (agent loads config at startup)
  buildStatus: "done" | "pending" | "blocked"; // drives landing page card border color
  note?: string; // optional note shown on the landing page card (e.g. requirements)
  mcpServers?: McpServerDef[]; // MCP resource servers used by this pattern
  platforms?: PlatformLink[]; // P8: per-platform video (detail page) + architecture diagram (landing card) links
}

export const PATTERNS: Pattern[] = [
  {
    id: "p1",
    title: "3rd Party Coding Assistant",
    subtitle: "3rd party agent → multiple MCP resources",
    description:
      "A coding assistant (Claude Code / Cursor) connects to the Okta MCP Bridge, which federates HR and Finance tools under one endpoint. Each tool call triggers an XAA token exchange per resource.",
    agentType: "3rd Party",
    authFlow: "XAA (bridge-mediated)",
    badge: "XAA",
    requiresAdapter: true,
    agentUrl: process.env.MCP_ADAPTER_URL ?? "http://localhost:8000",
    agentHealthUrl: process.env.P1_AGENT_INTERNAL_URL,
    rightPanel: "connection-guide",
    buildStatus: "done",
    mcpServers: [
      {
        name: "HR Server MCP",
        actor: "HR Server",
        tools: ["list_employees", "get_employee", "get_org_chart", "list_departments", "search_employees", "update_employee_title"],
      },
      {
        name: "Finance Server MCP",
        actor: "Finance Server",
        tools: ["get_budget", "list_invoices", "get_expense_report", "list_cost_centers", "get_invoice"],
      },
    ],
  },
  {
    id: "p2",
    title: "3rd Party Consumer Agent",
    subtitle: "Consumer-facing agent (ChatGPT, Gemini…) → single Okta-protected resource",
    description:
      "A consumer-facing agent such as ChatGPT or Gemini accesses a single Okta-protected resource on a user's behalf. The agent holds no Okta credentials — the user's identity flows through OAuth so the resource server always knows who is asking and can enforce the right access policies.",
    agentType: "3rd Party",
    authFlow: "OAuth 2.1",
    requiresAdapter: true,
    agentUrl: "http://localhost:3200",
    agentHealthUrl: process.env.P2_AGENT_INTERNAL_URL ?? "http://localhost:3200",
    rightPanel: "chat",
    buildStatus: "done",
    mcpServers: [
      {
        name: "Inventory MCP",
        actor: "Inventory Server",
        tools: ["get_product_catalog", "check_stock", "get_product_details", "get_order_status", "list_categories"],
      },
    ],
  },
  {
    id: "p3",
    title: "1st Party Agent - XAA",
    subtitle: "1st party agent → Okta-protected resource via native XAA",
    description:
      "A first-party agent registered as an Okta AI Agent principal performs native Cross App Access (XAA). The agent holds its own private key and exchanges tokens directly with Okta to act on behalf of the logged-in user.",
    agentType: "1st Party",
    authFlow: "XAA Native (ID-JAG)",
    badge: "XAA",
    requiresAdapter: false,
    agentUrl: process.env.NEXT_PUBLIC_P3_AGENT_URL ?? "http://localhost:3300",
    agentHealthUrl: process.env.P3_AGENT_INTERNAL_URL ?? process.env.NEXT_PUBLIC_P3_AGENT_URL ?? "http://localhost:3300",
    rightPanel: "chat",
    requiresUserToken: true,
    hasAgentStatus: true,
    buildStatus: "done",
    mcpServers: [
      {
        name: "HR Server MCP",
        actor: "HR Server",
        tools: ["list_employees", "get_employee", "get_org_chart", "list_departments", "search_employees", "update_employee_title"],
      },
      {
        name: "Finance Server MCP",
        actor: "Finance Server",
        tools: ["get_budget", "list_invoices", "get_expense_report", "list_cost_centers", "get_invoice"],
      },
    ],
  },
  {
    id: "p4",
    title: "Outbound SaaS via Okta STS",
    subtitle: "1st party agent → 3rd party SaaS (GitHub / Jira)",
    description:
      "A first-party agent uses Okta STS to broker a token for a 3rd party SaaS app. The agent never holds GitHub/Jira credentials — Okta issues a short-lived token on its behalf.",
    agentType: "1st Party",
    authFlow: "Okta STS token exchange",
    badge: "STS",
    requiresAdapter: false,
    agentUrl: process.env.NEXT_PUBLIC_P4_AGENT_URL ?? "http://localhost:3400",
    agentHealthUrl: process.env.P4_AGENT_INTERNAL_URL ?? "http://p4-agent:3400",
    rightPanel: "chat",
    requiresUserToken: true,
    buildStatus: "done",
    hasAgentStatus: true,
  },
  {
    id: "p5",
    title: "Human-in-the-Loop",
    subtitle: "Agent pauses for CIBA approval before executing write operations",
    description:
      "An agent that reads inventory freely via XAA but requires explicit human sign-off before any stock update. When a write is requested, the agent initiates an Okta CIBA flow — Okta pushes a notification to the user's enrolled Android authenticator. The agent holds the response open, polls for approval, then either executes the write with the CIBA-issued token or aborts with an explanation.",
    agentType: "Human-gated",
    authFlow: "XAA + CIBA",
    badge: "CIBA",
    requiresAdapter: false,
    agentUrl: process.env.NEXT_PUBLIC_P5_AGENT_URL ?? "http://localhost:3500",
    agentHealthUrl: process.env.P5_AGENT_INTERNAL_URL ?? "http://p5-agent:3500",
    rightPanel: "chat",
    requiresUserToken: true,
    buildStatus: "pending",
    note: "Requires companion Android mobile app",
    mcpServers: [
      {
        name: "Inventory MCP",
        actor: "Inventory Server",
        tools: ["check_stock", "get_product_details", "update_stock"],
      },
    ],
  },
  {
    id: "p6",
    title: "Autonomous / A2A",
    subtitle: "Orchestrator delegates to worker agents — each with its own Okta identity",
    description:
      "Agent-to-Agent delegation via Okta. An orchestrator agent (invoked by cron, an app, or a user) exchanges its subject token for an agent.invoke-scoped A2A token — authorized by an Okta delegation link — and invokes specialized HR and Finance worker agents. Each worker validates the token, carries the delegation chain forward (token-exchange → its resource), calls its MCP server, and returns an analysis the orchestrator combines and posts to Slack.",
    agentType: "A2A Orchestrator",
    authFlow: "A2A Delegation (ID-JAG)",
    badge: "A2A",
    requiresAdapter: false,
    agentUrl: process.env.NEXT_PUBLIC_P6_AGENT_URL ?? "http://localhost:3600",
    agentHealthUrl: process.env.P6_AGENT_INTERNAL_URL ?? "http://p6-agent:3600",
    rightPanel: "mission",
    requiresUserToken: false,
    hasAgentStatus: true,
    buildStatus: "done",
    mcpServers: [
      {
        name: "HR Server MCP",
        actor: "HR Server",
        tools: ["list_employees", "list_departments"],
      },
      {
        name: "Finance Server MCP",
        actor: "Finance Server",
        tools: ["get_budget", "get_expense_report", "list_cost_centers"],
      },
    ],
  },
  {
    id: "p7",
    title: "Agentic Permission Scoping",
    subtitle: "User delegates specific tool permissions to the agent via Okta FGA",
    description:
      "A first-party agent checks Okta FGA before every tool call. The user starts with zero delegations and toggles them on in real-time — FGA enforces the grant immediately, mid-conversation.",
    agentType: "1st Party",
    authFlow: "XAA + Okta FGA",
    badge: "FGA",
    requiresAdapter: false,
    agentUrl: process.env.NEXT_PUBLIC_P7_AGENT_URL ?? "http://localhost:3700",
    agentHealthUrl: process.env.P7_AGENT_INTERNAL_URL ?? "http://p7-saas-agent:3700",
    rightPanel: "delegation",
    requiresUserToken: true,
    buildStatus: "done",
    mcpServers: [
      {
        name: "HR Server MCP",
        actor: "HR Server",
        tools: ["list_employees", "get_employee", "get_org_chart", "list_departments", "search_employees", "update_employee_title"],
      },
      {
        name: "Finance Server MCP",
        actor: "Finance Server",
        tools: ["get_budget", "list_invoices", "get_expense_report", "list_cost_centers", "get_invoice"],
      },
    ],
  },
  {
    id: "p8",
    title: "Agent Building Platforms",
    subtitle: "Okta identity for agents built on AWS Bedrock, Agentforce, Copilot Studio…",
    description:
      "Most enterprise agents aren't hand-rolled — they're assembled on a platform like AWS Bedrock Agents, Salesforce Agentforce, or Microsoft Copilot Studio. Okta plugs into each of these platforms so every agent they produce inherits the same first-class identity: XAA-delegated user context, scoped resource tokens, and full auditability, without the platform vendor having to build any of it themselves.",
    agentType: "Platform Vendor",
    authFlow: "Platform-native XAA/OAuth",
    requiresAdapter: false,
    agentUrl: null,
    rightPanel: "videos",
    buildStatus: "pending",
    note: "Video showcase",
    platforms: [
      {
        label: "AWS Bedrock Agents",
        videoUrls: [
          { label: "AWS Bedrock Agents", url: "https://0lqdrzz0a2tp5gv9.public.blob.vercel-storage.com/videos/salesforce-agentforce" },
          { label: "AWS Agentcore", url: "https://0lqdrzz0a2tp5gv9.public.blob.vercel-storage.com/videos/aws-agentcore" },
        ],
      },
      { label: "Salesforce Agentforce" },
      { label: "Microsoft Copilot Studio" },
      {
        label: "Google Vertex AI",
        videoUrls: [
          { label: "Gemini / Vertex AI", url: "https://0lqdrzz0a2tp5gv9.public.blob.vercel-storage.com/videos/gemini-vertex" },
        ],
      },
    ],
  },
];

export function getPattern(id: string): Pattern | undefined {
  return PATTERNS.find((p) => p.id === id);
}
