'use strict';

const { okta } = require('../lib/okta');
const { generateRsaJwkPair } = require('../lib/keygen');
const { provisionAiAgent, registerAgentKey, findApp } = require('./p3');

async function provisionP6(env) {
  const results = {};

  // ── Key pair for P6 WLP ───────────────────────────────────────────────────
  let privateJwk, publicJwk;
  if (env.P6_OKTA_PRIVATE_KEY) {
    console.log('  [P6]      ⏭  RSA key pair (P6_OKTA_PRIVATE_KEY already set)');
    privateJwk = JSON.parse(env.P6_OKTA_PRIVATE_KEY);
    publicJwk = toPublicJwk(privateJwk);
  } else {
    ({ privateJwk, publicJwk } = generateRsaJwkPair());
    results.P6_OKTA_PRIVATE_KEY = JSON.stringify(privateJwk);
    console.log('  [P6]      ✔  RSA-2048 key pair generated');
  }

  // ── CC service app (client_credentials for P6 autonomous flow) ────────────
  // This app is separate from the WLP — it holds the CC client credentials.
  // The WLP is linked to a separate placeholder web app (required by Okta for WLP association).
  let ccClientId, ccClientSecret;

  if (env.P6_OKTA_CLIENT_ID) {
    console.log(`  [P6]      ⏭  CC service app (P6_OKTA_CLIENT_ID already set: ${env.P6_OKTA_CLIENT_ID})`);
    ccClientId = env.P6_OKTA_CLIENT_ID;
    ccClientSecret = env.P6_OKTA_CLIENT_SECRET || '';
  } else {
    const ccAppLabel = 'okta-demo-p6-autonomous-m2m';
    let ccApp = await findApp(ccAppLabel);

    if (!ccApp) {
      ccApp = await okta('/api/v1/apps', 'POST', {
        name: 'oidc_client',
        label: ccAppLabel,
        signOnMode: 'OPENID_CONNECT',
        credentials: {
          oauthClient: {
            token_endpoint_auth_method: 'client_secret_basic',
          },
        },
        settings: {
          oauthClient: {
            response_types: ['token'],
            grant_types: [
              'authorization_code',
              'client_credentials',
              'refresh_token',
              'urn:ietf:params:oauth:grant-type:token-exchange',
            ],
            application_type: 'service',
            consent_method: 'TRUSTED',
            issuer_mode: 'DYNAMIC',
          },
        },
      });
      console.log(`  [P6]      ✔  CC service app created → ${ccApp.id}`);
    } else {
      console.log(`  [P6]      ⏭  CC service app already exists → ${ccApp.id}`);
    }

    ccClientId = ccApp.credentials.oauthClient.client_id;
    ccClientSecret = ccApp.credentials.oauthClient.client_secret || '';
    results.P6_OKTA_CLIENT_ID = ccClientId;
    results.P6_OKTA_CLIENT_SECRET = ccClientSecret;
    console.log(`  [P6]      ✔  P6_OKTA_CLIENT_ID=${ccClientId}`);
  }

  // ── Placeholder web app for P6 WLP linkage ────────────────────────────────
  // Okta WLPs (AI Agents) must be linked to a web app (not a service app).
  // This placeholder exists solely to satisfy that requirement.
  let wlpAppId;
  const wlpAppLabel = 'okta-demo-p6-wlp-placeholder';

  let wlpApp = await findApp(wlpAppLabel);
  if (!wlpApp) {
    wlpApp = await okta('/api/v1/apps', 'POST', {
      name: 'oidc_client',
      label: wlpAppLabel,
      signOnMode: 'OPENID_CONNECT',
      credentials: {
        oauthClient: {
          token_endpoint_auth_method: 'client_secret_basic',
        },
      },
      settings: {
        oauthClient: {
          redirect_uris: [`${env.NEXTAUTH_URL || 'http://localhost:3020'}/api/auth/callback/p6`],
          response_types: ['code'],
          grant_types: ['authorization_code', 'refresh_token'],
          application_type: 'web',
          consent_method: 'TRUSTED',
          issuer_mode: 'DYNAMIC',
          pkce_required: false,
        },
      },
    });
    console.log(`  [P6]      ✔  WLP placeholder app created → ${wlpApp.id}`);
  } else {
    console.log(`  [P6]      ⏭  WLP placeholder app already exists → ${wlpApp.id}`);
  }
  wlpAppId = wlpApp.id;

  // ── P6 AI Agent (Workload Principal) ──────────────────────────────────────
  if (env.P6_OKTA_AI_AGENT_ID) {
    console.log(`  [P6]      ⏭  AI Agent (P6_OKTA_AI_AGENT_ID already set: ${env.P6_OKTA_AI_AGENT_ID})`);
  } else {
    const agentId = await provisionAiAgent(wlpAppId, 'okta-demo-p6-agent', 'P6');
    if (agentId) {
      await registerAgentKey(agentId, publicJwk);
      results.P6_OKTA_AI_AGENT_ID = agentId;
      console.log(`  [P6]      ✔  AI Agent → P6_OKTA_AI_AGENT_ID=${agentId}`);
      console.log(`  [P6]      ✔  Public JWK registered on AI Agent`);
    } else {
      console.log('  [P6]      ⚠  AI Agent registration unavailable — set P6_OKTA_AI_AGENT_ID manually');
    }
  }

  // ── CC policies on HR and Finance auth servers ────────────────────────────
  const hrServerId = env.HR_AUTHZ_SERVER_ID;
  const financeServerId = env.FINANCE_AUTHZ_SERVER_ID;
  const agentId = results.P6_OKTA_AI_AGENT_ID || env.P6_OKTA_AI_AGENT_ID;

  if (!hrServerId || !financeServerId) {
    console.log('  [P6]      ⚠  HR_AUTHZ_SERVER_ID or FINANCE_AUTHZ_SERVER_ID not set — skipping CC policies');
    console.log('           Run the shared step first, or set them manually.');
  } else if (!agentId && !ccClientId) {
    console.log('  [P6]      ⚠  No agent or CC client ID available — skipping CC policies');
  } else {
    // Use the WLP ID (agent acts as itself via CC), falling back to CC client ID
    const subjectId = agentId || ccClientId;
    await ensureCcPolicy(hrServerId, subjectId, 'HR');
    await ensureCcPolicy(financeServerId, subjectId, 'Finance');
    console.log(`  [P6]      ✔  client_credentials policies on HR + Finance auth servers`);
  }

  return results;
}

async function ensureCcPolicy(authzServerId, clientId, label) {
  const policyName = `Demo CC Policy — ${label}`;
  let policies = [];
  try {
    policies = await okta(`/api/v1/authorizationServers/${authzServerId}/policies`);
  } catch { /* none */ }

  let policy = (policies || []).find(p => p.name === policyName);
  if (!policy) {
    policy = await okta(`/api/v1/authorizationServers/${authzServerId}/policies`, 'POST', {
      type: 'OAUTH_AUTHORIZATION_POLICY',
      status: 'ACTIVE',
      name: policyName,
      description: `CC grant for P6 autonomous agent — ${label} — provisioned by setup script`,
      priority: 2,
      conditions: {
        clients: { include: ['ALL_CLIENTS'] },
      },
    });
  }

  const ruleName = `Demo CC Rule — ${label}`;
  let rules = [];
  try {
    rules = await okta(`/api/v1/authorizationServers/${authzServerId}/policies/${policy.id}/rules`);
  } catch { /* none */ }

  const existing = (rules || []).find(r => r.name === ruleName);
  if (!existing) {
    await okta(
      `/api/v1/authorizationServers/${authzServerId}/policies/${policy.id}/rules`,
      'POST',
      {
        type: 'RESOURCE_ACCESS',
        status: 'ACTIVE',
        name: ruleName,
        priority: 1,
        conditions: {
          people: { users: { include: [], exclude: [] }, groups: { include: ['EVERYONE'], exclude: [] } },
          grantTypes: { include: ['client_credentials'] },
          scopes: { include: ['*'] },
        },
        actions: {
          token: {
            accessTokenLifetimeMinutes: 60,
            refreshTokenLifetimeMinutes: 129600,
            refreshTokenWindowMinutes: 10080,
            inlineHook: null,
          },
        },
      },
    );
  }
}

function toPublicJwk(jwk) {
  const { d, p, q, dp, dq, qi, ...pub } = jwk;
  return pub;
}

module.exports = { provisionP6 };
