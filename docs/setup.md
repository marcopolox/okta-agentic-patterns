# Setup & Provisioning Guide

This guide walks you through going from a blank Okta org to a fully-running demo. The provisioning script handles ~20 Okta resources automatically; you only need to fill in a handful of seed values manually.

---

## Prerequisites

| Requirement | Notes |
|-------------|-------|
| Okta org | Free developer org at [developer.okta.com](https://developer.okta.com). Preview orgs (`*.oktapreview.com`) work too. |
| Okta SSWS admin token | Created during the setup step — see below. Needs full admin scope. |
| Node.js 18+ | For the setup script (`node scripts/setup.js`). |
| Docker + Docker Compose | For running the pattern services. |
| LLM key | `ANTHROPIC_API_KEY` (Claude, preferred) or `OPENAI_API_KEY` (OpenAI fallback). At least one required. |
| Slack app (optional) | Only needed for P6 Slack posting. See P6 section. |

---

## Step 1 — Copy and fill the seed values

```bash
cp .env.example .env
```

Open `.env` and fill in the values marked in the **STEP 1** section. These are the only variables you provide manually — everything else is written by the setup script.

### Required seed values

| Variable | Where to find it | Example |
|----------|-----------------|---------|
| `OKTA_DOMAIN` | Okta Admin → Dashboard (top-right corner) | `dev-12345678.okta.com` |
| `OKTA_AUTH_SERVER_ID` | Okta Admin → Security → API → Authorization Servers → "default" → Settings | `default` or `aus1abc...` |
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) → API Keys | `sk-ant-...` |
| `OPENAI_API_KEY` | [platform.openai.com](https://platform.openai.com) → API Keys | `sk-...` *(fallback if no Anthropic key)* |

> **`OKTA_AUTH_SERVER_ID`**: The built-in `default` authorization server works. This is used by P4 for STS token exchange. If you prefer a custom server, create one at Okta Admin → Security → API → Authorization Servers.

### Optional seed values

| Variable | Default | Notes |
|----------|---------|-------|
| `NEXTAUTH_URL` | `http://localhost:3020` | Change if hosting on a server. All OAuth redirect URIs are derived from this base. |
| `MCP_ADAPTER_URL` | `http://localhost:8008` | URL of the standalone Okta MCP Bridge (P1 only). |
| `CONSOLE_PORT` | `3020` | Must match the port in `NEXTAUTH_URL`. |
| `EVENT_BUS_PORT` | `4000` | SSE event bus port. |
| `P2_PORT`–`P7_PORT` | `3200`–`3700` | One port per pattern agent. |
| `SLACK_BOT_TOKEN` | *(blank)* | Required for P6 Slack posting. Format: `xoxb-...` |
| `SLACK_DEFAULT_CHANNEL` | `general` | Channel name without `#`. |

### P4 — manual OIN resources (cannot be automated)

P4 requires two Okta OIN integrations that must be configured by hand. Leave these blank for now — the script will print instructions at the end:

| Variable | Instructions |
|----------|-------------|
| `P4_GITHUB_STS_RESOURCE` | Okta Admin → Applications → Browse App Catalog → **GitHub Enterprise** → Enable STS → copy the resource ORN (`orn:okta:...`) |
| `P4_SLACK_STS_RESOURCE` | Okta Admin → Applications → Browse App Catalog → **Slack** → Enable STS → install with scopes `chat:write`, `chat:write.public`, `channels:read` → copy ORN |

---

## Step 2 — Create an SSWS admin token

The setup script needs a **temporary** SSWS token to call the Okta Management API. It is prompted at runtime and never written to `.env`.

1. Okta Admin → Security → API → Tokens → **Create Token**
2. Name it anything (e.g. `demo-setup`)
3. Copy the token value — you will only see it once

You can revoke this token after setup completes.

---

## Step 3 — Run the provisioning script

```bash
node scripts/setup.js
```

The script will:

1. Read your `.env`, verify `OKTA_DOMAIN` is reachable
2. Prompt for the SSWS token
3. Provision all Okta resources in order:

```
[Shared]  ✔  HR auth server        → HR_AUTHZ_SERVER_ID
          ✔  Finance auth server   → FINANCE_AUTHZ_SERVER_ID
          ✔  Inventory auth server → INVENTORY_AUTHZ_SERVER_ID

[P2]      ✔  OAuth app             → P2_OKTA_CLIENT_ID / P2_OKTA_CLIENT_SECRET

[P3]      ✔  RSA-2048 key pair     → P3_OKTA_PRIVATE_KEY
          ✔  OAuth app (shared)    → P3_OKTA_CLIENT_ID / P3_OKTA_CLIENT_SECRET
          ✔  AI Agent              → P3_OKTA_AI_AGENT_ID

[P4]      ✔  RSA-2048 key pair     → P4_OKTA_PRIVATE_KEY
          ✔  Reusing shared app    → P4_OKTA_CLIENT_ID / P4_OKTA_CLIENT_SECRET
          ✔  AI Agent              → P4_OKTA_AI_AGENT_ID
          ✔  token-exchange policy on OKTA_AUTH_SERVER_ID
          ⚠  OIN resources: manual setup required (printed at end)

[P6]      ✔  RSA-2048 key pair     → P6_OKTA_PRIVATE_KEY
          ✔  CC service app        → P6_OKTA_CLIENT_ID / P6_OKTA_CLIENT_SECRET
          ✔  WLP placeholder app   (internal — not written to .env)
          ✔  AI Agent              → P6_OKTA_AI_AGENT_ID
          ✔  client_credentials policies on HR + Finance auth servers

✔  .env updated (N variables provisioned)
```

4. Print manual instructions for P4 OIN resources (if not already set)
5. Write all provisioned values back into `.env`

---

## What gets provisioned

### Authorization servers (3)

Each resource server gets a dedicated Okta authorization server with its own audience and scopes:

| Server | Audience | Scopes |
|--------|----------|--------|
| `okta-demo-hr` | `api:hr` | `hr:read`, `hr:write`, `hr:delete`, `interclient_access`, `mcp:read`, `mcp:write` |
| `okta-demo-finance` | `api:finance` | `finance:read`, `finance:write`, `finance:approve`, `interclient_access`, `mcp:read`, `mcp:write` |
| `okta-demo-inventory` | `api://inventory-resource` | `inventory:read`, `inventory:write` |

Each server gets a policy + rule enabling all required grant types (`authorization_code`, `client_credentials`, `jwt-bearer`, `token-exchange`, `device_code`; Inventory also gets `ciba`).

### OAuth clients (3)

| App | Auth method | Purpose |
|-----|-------------|---------|
| `okta-demo-p2-consumer-agent` | `client_secret_basic` + PKCE | P2 user-facing PKCE login |
| `okta-demo-p3-p4-shared` | `client_secret_basic` | Shared app for P3 + P4 user login; both WLPs linked here |
| `okta-demo-p6-autonomous-m2m` | `client_secret_basic` | P6 CC grant (service app) |
| `okta-demo-p6-wlp-placeholder` | `client_secret_basic` | Placeholder web app required for WLP linkage |

### AI Agents / Workload Principals (3)

One AI Agent per pattern (P3, P4, P6). Each gets:
- A generated RSA-2048 key pair (private key stored as JWK in `.env`, public key uploaded to the WLP)
- Linked to the appropriate OAuth app

### Auth server policies

| Policy | Server | Grant type enabled |
|--------|--------|--------------------|
| P3/P4 jwt-bearer | HR + Finance | `urn:ietf:params:oauth:grant-type:jwt-bearer` |
| P4 token-exchange | `OKTA_AUTH_SERVER_ID` | `urn:ietf:params:oauth:grant-type:token-exchange` |
| P6 client-credentials | HR + Finance | `client_credentials` |

---

## Idempotency

The script is safe to run multiple times. Before every `POST`, it queries the existing list and skips creation if a resource with the same name already exists. Already-set `.env` values are never overwritten.

---

## After provisioning

After the script completes, your `.env` will have all required values filled in. Start any pattern:

```bash
docker compose --profile p3 up --build
# → http://localhost:3020/patterns/p3
```

See the [README](../README.md) for all run commands.

---

## Troubleshooting

**`OKTA_DOMAIN` not reachable**: Make sure there is no `https://` prefix and no trailing slash. Example: `dev-12345678.okta.com`.

**AI Agent API error (⚠ AI Agent registration unavailable)**: The Workload Principal API (`/workload-principals/api/v1/ai-agents`) may not be enabled on all Okta orgs. If this occurs, the script degrades gracefully — set `P3_OKTA_AI_AGENT_ID`, `P4_OKTA_AI_AGENT_ID`, `P6_OKTA_AI_AGENT_ID` manually via Okta Admin → AI Agents.

**`HR_AUTHZ_SERVER_ID` or `FINANCE_AUTHZ_SERVER_ID` missing after shared step**: Check the script output for errors during the `[Shared]` step. The most common cause is the SSWS token lacking sufficient permissions.

**P4 OIN resources not appearing in Okta**: OIN app catalog availability varies by Okta edition. GitHub Enterprise and Slack STS integrations require an Okta Workforce Identity plan.
