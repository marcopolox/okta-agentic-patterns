# Architecture Deep-Dive

---

## Component Overview

### Console (Next.js, port 3020)

The shared UI that hosts all 7 patterns. It is a Next.js 15 app with:

- **Landing page** (`/`) — pattern cards with status badges
- **Pattern pages** (`/patterns/[id]`) — server-rendered; reads HttpOnly cookies for user tokens; runs agent health checks server-side on each request
- **`PatternInteraction` client component** — SSE subscription, chat panel, login gates for patterns that require a user token
- **Auth routes** — `/api/auth/start/:pattern` and `/api/auth/callback/:pattern` server routes handle all PKCE flows server-side (never expose client IDs to the browser)
- **Right panel variants**: `chat` (P2–P4), `mission` (P6), `connection-guide` (P1)

> **`NEXT_PUBLIC_*` env vars are baked at build time.** Docker's runtime `environment:` block cannot provide them. All Okta parameters are read server-side in API routes — never in browser code.

### Event Bus (Node.js, port 4000)

A lightweight SSE relay. All pattern agents and MCP servers `POST /emit` with `{ patternId, type, data }`. The console subscribes to `GET /events/:patternId` and renders the live stream.

This decouples agents from the UI — agents never know who is watching.

### LLM Client (`shared/llm-client`)

A thin wrapper around the Anthropic and OpenAI SDKs. Reads `ANTHROPIC_API_KEY` first; falls back to `OPENAI_API_KEY`. Exposes a single `chat(messages, tools?, system?)` function returning `{ text, toolCalls, stopReason }`.

All pattern agents import this package — no LLM code is duplicated across patterns.

### MCP Resource Servers

Three canonical implementations; one running container each:

| Server | Port | Profiles | Tools |
|--------|------|----------|-------|
| HR | 3101 | p1, p3, p6 | `list_employees`, `get_employee`, `get_org_chart`, `list_departments`, `search_employees`, `update_employee_title` |
| Finance | 3102 | p1, p3, p6 | `get_budget`, `list_invoices`, `get_expense_report`, `list_cost_centers`, `get_invoice` |
| Inventory | 3103 | p2 | `get_product_catalog` *(public)*, `check_stock`, `get_product_details`, `get_order_status`, `list_categories` |

**To add a new pattern that needs HR/Finance**: add the profile name to `profiles: [...]` and append to `PATTERN_IDS: ...` in `docker-compose.yml`. No new containers needed.

**Token validation** (HR + Finance): every `tools/call` requires a valid Bearer token. JWKS URL is derived from `OKTA_ISSUER` (`${OKTA_ISSUER}/v1/keys`). The server validates `iss`, `aud`, and signature. Successful validation emits a `token-validated` event with the `sub` and `act` claims to the event bus.

**Token validation** (Inventory): `tools/call` for non-public tools requires a Bearer token. The public tool `get_product_catalog` is always allowed — no token required. The agent connects without a token for tool discovery; auth is only enforced at call time.

**Event deduplication**: MCP servers deduplicate `token-validated` events with a 10-second in-memory Set keyed by `(sub, jti)` to avoid flooding the event stream on repeated calls within the same session.

---

## Auth Patterns at a Glance

```
P1 — 3rd Party Coding Assistant
  Operator identity
    → Okta MCP Bridge (external)
      → XAA per resource server
        → HR/Finance MCP (Bearer token per call)

P2 — 3rd Party Consumer Agent
  Anonymous user
    → p2-agent (no token: public catalog only)
  User clicks auth link
    → Console PKCE (Inventory auth server, inventory:read)
      → access_token in HttpOnly cookie
        → p2-agent (Bearer token: all 5 Inventory tools)

P3 — 1st Party XAA Native
  User login (PKCE, console)
    → id_token in HttpOnly cookie
      → p3-agent (Bearer id_token)
        → XAA Step 1: id_token → ID-JAG (org auth server)
          → XAA Step 2: ID-JAG → resource token (HR/Finance auth server)
            → HR/Finance MCP (Bearer resource token)

P4 — Outbound SaaS via Okta STS
  User login (PKCE, console)
    → id_token in HttpOnly cookie
      → p4-agent (Bearer id_token)
        → STS token exchange (OKTA_AUTH_SERVER_ID)
          → GitHub/Slack access token
            → GitHub API / Slack API

P5 — Human-in-the-Loop (pending)
  Same login as P3 + explicit approval gate before sensitive tool calls

P6 — Autonomous A2A (Client Credentials)
  No user
    → p6-agent (no token from console)
      → CC grant (HR auth server) → hr:read token
      → CC grant (Finance auth server) → finance:read token
        → HR/Finance MCP (Bearer CC token)
      → Slack (bot token directly)

P7 — Multi-Tenant FGA (pending)
  Tenant user login
    → agent extracts tenant claim
      → Okta FGA check (allow/deny per tenant)
        → tenant-scoped tool call
```

---

## Okta Concepts Used

### Workload Principals (AI Agents)

A Workload Principal (`wlp_xxx`) is an Okta entity representing an AI agent's identity. It is linked to an OAuth web app client and carries its own set of credentials (public JWKs). Pattern agents sign client assertions with their private key; the corresponding public key is registered on the WLP.

WLPs are used in P3, P4, and P6.

> Okta requires WLPs to be linked to a **web app** client (not a service app). P6 therefore maintains two separate entities: a CC service app for the `client_credentials` grant, and a placeholder web app used only to satisfy the WLP linkage requirement.

### XAA (Extended Agent Authorization) / ID-JAG

XAA is Okta's two-step protocol for user-delegated agent identity:

1. **Step 1 — org token server**: Exchange user's `id_token` for an ID-JAG (an intermediate token that carries the user's identity and the requested scopes, signed for a specific downstream auth server as the audience).

2. **Step 2 — resource auth server**: Exchange the ID-JAG for a resource access token using the `jwt-bearer` grant. The resulting token carries both `sub` (user) and `act` (agent) claims, enabling resource servers to see the full delegation chain.

> Critical: do NOT include `scope` in Step 2 — Okta rejects it. Scopes are embedded in the ID-JAG from Step 1.

See [P3 doc](patterns/p3.md) for the full token exchange request details.

### Okta STS (Security Token Service)

P4 uses Okta's STS to swap a user's `id_token` for a third-party SaaS access token (GitHub, Slack) without the user re-authenticating. The STS exchange uses the `urn:okta:params:oauth:token-type:oauth-sts` requested token type and an Okta OIN app resource ORN to identify the target service.

See [P4 doc](patterns/p4.md) for details.

### Client Credentials + JWT Assertion

P6 uses the standard OAuth 2.0 CC grant with `private_key_jwt` client authentication. The agent signs a JWT assertion (`iss=sub=OKTA_AI_AGENT_ID`) and presents it to the resource auth server's token endpoint. No user is involved.

---

## Docker Compose Profile Design

Each pattern is a Docker Compose *profile*. Starting a profile brings up:
- The pattern's agent container
- Any resource servers that profile depends on (via `profiles: [...]` on each server)

The console and event bus are always started regardless of profile.

```yaml
# Simplified docker-compose.yml structure
services:
  console:        # no profile — always runs
  event-bus:      # no profile — always runs
  hr-server:      profiles: [p1, p3, p6]
  finance-server: profiles: [p1, p3, p6]
  inventory-server: profiles: [p2]
  p2-agent:       profiles: [p2]
  p3-agent:       profiles: [p3]
  p4-agent:       profiles: [p4]
  p6-agent:       profiles: [p6]
```

Running `docker compose --profile p3 up` starts: `console`, `event-bus`, `hr-server`, `finance-server`, `p3-agent`.

---

## Health Checks

The console's server component performs a health check against each pattern agent on every page load:

- Pattern pages check `GET /health` on the agent's **Docker internal URL** (`agentHealthUrl`, e.g. `http://p3-agent:3300`) — not the browser-facing URL — because the check runs server-side inside the Docker network.
- If the health check fails, the pattern page shows a "service offline" state and disables the chat panel.
- The browser-facing `agentUrl` (e.g. `http://localhost:3300`) is used only for `POST /chat` calls from the browser.

---

## Private Key Storage

Private keys for P3, P4, and P6 are stored as single-line minified JWK JSON in `.env`. They are never committed (`.gitignore` excludes `.env`), never sent to Okta (only the public key is uploaded), and never logged.

The `.env.example` JWK lines must be on a single line with no whitespace — `.env` parsers interpret trailing content on the same line as part of the value.
