# Okta Agentic Patterns Demo

A customer-facing demo application showcasing 8 Okta agentic identity patterns in a single running environment. Each pattern is an isolated service demonstrating a different approach to securing AI agents — from delegated user identity through to fully autonomous machine-to-machine flows.

---

![Okta Agentic Demo landing page](https://iconsandstuff.s3.us-east-1.amazonaws.com/okta-agentic-demo-landing.png)

---

## What This Demonstrates

Modern AI agents act on behalf of users or autonomously on their own. Both cases raise hard identity questions: *who is the agent, who authorized it, and what is it allowed to do?* This demo answers those questions concretely using Okta's agentic identity stack.

| # | Pattern | Auth Flow | Status |
|---|---------|-----------|--------|
| P1 | [3rd Party Coding Assistant](docs/patterns/p1.md) | 3rd party coding assistant → multiple MCP resources via Okta MCP Bridge | ✅ Built |
| P2 | [3rd Party Consumer Agent](docs/patterns/p2.md) | Consumer agent → Inventory resource; user delegates via inline PKCE | ✅ Built |
| P3 | [1st Party XAA Native](docs/patterns/p3.md) | 1st party agent → user-delegated identity via Okta XAA (ID-JAG) → HR + Finance | ✅ Built |
| P4 | [Outbound SaaS via Okta STS](docs/patterns/p4.md) | 1st party agent → GitHub + Slack via Okta STS token brokering | ✅ Built |
| P5 | [Human-in-the-Loop](docs/patterns/p5.md) | Agent pauses for explicit human approval before sensitive actions | 🔲 Pending |
| P6 | [Autonomous A2A Delegation](docs/patterns/p6.md) | User signs in → orchestrator delegates to worker agents via Okta A2A; identity chain flows end-to-end to HR + Finance | ✅ Built |
| P7 | [Agentic Permission Scoping](docs/patterns/p7.md) | User delegates specific tool permissions to the agent via Okta FGA; grants are enforced in real-time, mid-conversation | ✅ Built |
| P8 | [Agent Building Platforms](docs/patterns/p8.md) | Okta identity for agents built on AWS Bedrock, Salesforce Agentforce, Microsoft Copilot Studio, and Google Vertex AI | 📹 Videos |

---

## Architecture Overview

```
Browser
  └── Console (Next.js :3020)
        │  health check → each agent /health
        │  SSE subscribe → event-bus :4000/events/:patternId
        │  chat → POST agent :PORT/chat
        │
        └── Event Bus (Node.js :4000)
               ← POST /emit  from pattern agents + MCP servers
               → GET /events/:patternId  to console

Pattern Agents (:3200–:3700)
  GET  /health
  GET  /status → { state, servers, message }  (P3, P4, P6 — console polls before showing chat)
  GET  /refresh → re-load connections from Okta  (P3 only)
  POST /chat   → streaming text response

Shared MCP Resource Servers
  HR Server        :3101  (profiles: p1, p3, p6)
  Finance Server   :3102  (profiles: p1, p3, p6)
  Inventory Server :3103  (profiles: p2)
```

**Single instance per resource server.** All patterns that need a resource share the same container — no per-pattern duplicates.

**LLM selection**: Claude (via `ANTHROPIC_API_KEY`) preferred; falls back to OpenAI (`OPENAI_API_KEY`).

---

## Repository Layout

```
okta-agentic-demo/
├── console/                  ← Next.js UI (port 3020)
├── shared/
│   ├── event-bus/            ← SSE relay (port 4000)
│   ├── llm-client/           ← Claude/OpenAI wrapper
│   └── mcp-servers/
│       ├── hr/               ← HR MCP resource server
│       ├── finance/          ← Finance MCP resource server
│       └── inventory/        ← Inventory MCP resource server
├── patterns/
│   ├── p2-third-party-single/
│   ├── p3-first-party-xaa/
│   ├── p4-outbound-saas/
│   ├── p5-human-delegation/
│   └── p6-autonomous-m2m/
├── scripts/                  ← Okta provisioning automation
│   ├── setup.js              ← Main entry point
│   ├── lib/
│   └── steps/
├── docker-compose.yml
├── .env.example
└── docs/
    ├── setup.md              ← Provisioning guide
    ├── architecture.md       ← Deep-dive architecture
    └── patterns/
        ├── p1.md … p7.md
```

---

## Quick Start

### Prerequisites

- Docker + Docker Compose
- Node.js 18+ (for the setup script)
- An Okta org — free developer org at [developer.okta.com](https://developer.okta.com)
- At least one LLM key: Anthropic (`sk-ant-...`) or OpenAI (`sk-...`)

### 1. Clone and configure

```bash
git clone https://github.com/marcopolox/okta-agentic-demo.git
cd okta-agentic-demo
cp .env.example .env
```

Edit `.env` and fill in the **seed values** (top section):

| Variable | Where to find it |
|----------|-----------------|
| `OKTA_DOMAIN` | Okta Admin → Dashboard, top-right (e.g. `dev-12345678.okta.com`) |
| `OKTA_AUTH_SERVER_ID` | Okta Admin → Security → API → Authorization Servers → "default" → Settings |
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) → API Keys |

### 2. Provision Okta resources

```bash
node scripts/setup.js
```

The script prompts for a temporary SSWS admin token, then automatically creates all authorization servers, OAuth clients, AI Agents, and RSA key pairs. It writes the generated IDs back into `.env`.

See [docs/setup.md](docs/setup.md) for the full list of what gets provisioned and which steps require manual configuration.

### 3. Start a pattern

```bash
# Console + event bus only
docker compose up console event-bus

# P3 — 1st Party XAA Native
docker compose --profile p3 up --build

# P4 — Outbound SaaS
docker compose --profile p4 up --build

# P6 — Autonomous A2A
docker compose --profile p6 up --build

# P2 — 3rd Party Consumer Agent
docker compose --profile p2 up --build

# P1 — 3rd Party Coding Assistant (standalone Okta MCP Bridge must already be running)
docker compose --profile p1 up --build

# Everything
docker compose up --build
```

Open [http://localhost:3020](http://localhost:3020).

---

## Okta Configuration

### What the setup script handles automatically

Running `node scripts/setup.js` provisions these Okta resources:

| Resource | Count | Used by |
|----------|-------|---------|
| Authorization servers | 3 | HR (`api:hr`), Finance (`api:finance`), Inventory (`api://inventory-resource`) |
| OAuth apps | 3 | P2 consumer PKCE app, shared P3/P4 login app, P6 service app |
| AI Agents (Workload Principals) | 3 | P3, P4, P6 — each gets a generated RSA-2048 key pair |
| Auth server policies | P3/P4 `jwt-bearer` on HR + Finance; P4 `token-exchange` on default AS; P6 `client_credentials` on HR + Finance |

All generated values (`*_AUTHZ_SERVER_ID`, `*_OKTA_CLIENT_ID`, `*_OKTA_AI_AGENT_ID`, `*_PRIVATE_KEY`, etc.) are written into `.env` automatically.

### Manual setup required for P4 (Outbound SaaS)

P4 uses Okta OIN integrations that cannot be created via the Management API:

1. **GitHub Enterprise** — Okta Admin → Applications → Browse App Catalog → GitHub Enterprise → Enable STS → copy the resource ORN → set `P4_GITHUB_STS_RESOURCE`
2. **Slack** — same flow for Slack → install with scopes `chat:write`, `chat:write.public`, `channels:read` → set `P4_SLACK_STS_RESOURCE`

> The setup script prints exact instructions for these at the end of its run.

### Manual setup required for P6 (A2A Delegation)

P6 uses Okta's A2A delegation features, which require SUPER_ADMIN and the `OKTA_FOR_AI_AGENTS` / `SECURE_AI_A2A_SERVERS` beta flags enabled on your org. These steps are **not automated** by the setup script:

**Orchestrator (run once):**
1. Okta Admin → AI Agents → select the P6 orchestrator agent → **Delegations** → Add caller: User sign-on (links the P6 web app client as the user entry point)

**Per worker (repeat for HR worker and Finance worker):**
1. Publish the worker AI Agent as an A2A server (Admin → AI Agents → worker → A2A Settings) — creates the `agent.invoke` scope
2. On the **orchestrator**, add an `IDENTITY_ASSERTION_A2A_SERVER` connection pointing to the worker's A2A authorization server
3. Add a delegation link: orchestrator → worker (Admin → AI Agents → orchestrator → Delegations)
4. On the **worker**, add an `IDENTITY_ASSERTION_CUSTOM_AS` connection pointing to the HR (or Finance) authorization server with scope `hr:read` (or `finance:read`)
5. Add a delegation link: worker → HR/Finance resource
6. On the HR (or Finance) authorization server → Access Policies → `jwt-bearer` rule → add the worker AI Agent as an allowed principal

See [docs/patterns/p6.md](docs/patterns/p6.md) for the full token exchange flow and what each step authorizes.

### Shared auth server scopes

| Server | Audience | Scopes |
|--------|----------|--------|
| `okta-demo-hr` | `api:hr` | `hr:read`, `hr:write`, `hr:delete` |
| `okta-demo-finance` | `api:finance` | `finance:read`, `finance:write`, `finance:approve` |
| `okta-demo-inventory` | `api://inventory-resource` | `inventory:read`, `inventory:write` |

---

## Pattern Docs

- [P1 — 3rd Party Coding Assistant](docs/patterns/p1.md)
- [P2 — 3rd Party Consumer Agent](docs/patterns/p2.md)
- [P3 — 1st Party XAA Native](docs/patterns/p3.md)
- [P4 — Outbound SaaS via Okta STS](docs/patterns/p4.md)
- [P5 — Human-in-the-Loop](docs/patterns/p5.md) *(pending)*
- [P6 — Autonomous A2A Delegation](docs/patterns/p6.md)
- [P7 — Agentic Permission Scoping](docs/patterns/p7.md)
- [P8 — Agent Building Platforms](docs/patterns/p8.md) *(video showcase)*

## Additional Docs

- [Setup & Provisioning](docs/setup.md)
- [Architecture Deep-Dive](docs/architecture.md)
