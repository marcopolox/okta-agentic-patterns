'use strict';

const { okta } = require('../lib/okta');
const { generateRsaJwkPair } = require('../lib/keygen');
const { provisionAiAgent, registerAgentKey, findApp } = require('./p3');

async function provisionP4(env) {
  const results = {};

  // ── Key pair for P4 WLP ───────────────────────────────────────────────────
  let privateJwk, publicJwk;
  if (env.P4_OKTA_PRIVATE_KEY) {
    console.log('  [P4]      ⏭  RSA key pair (P4_OKTA_PRIVATE_KEY already set)');
    privateJwk = JSON.parse(env.P4_OKTA_PRIVATE_KEY);
    publicJwk = toPublicJwk(privateJwk);
  } else {
    ({ privateJwk, publicJwk } = generateRsaJwkPair());
    results.P4_OKTA_PRIVATE_KEY = JSON.stringify(privateJwk);
    console.log('  [P4]      ✔  RSA-2048 key pair generated');
  }

  // ── Shared web app (reuse the one created by P3 step) ─────────────────────
  // P4 uses the same client ID/secret as P3 for user-facing PKCE login.
  let appId;
  const sharedClientId = env.P3_OKTA_CLIENT_ID;
  const sharedClientSecret = env.P3_OKTA_CLIENT_SECRET || '';

  if (!sharedClientId) {
    console.log('  [P4]      ⚠  P3_OKTA_CLIENT_ID not set — P3 step must run first; skipping P4 app setup');
    return results;
  }

  if (env.P4_OKTA_CLIENT_ID) {
    console.log('  [P4]      ⏭  Shared web app (P4_OKTA_CLIENT_ID already set)');
    appId = await getAppId(sharedClientId);
  } else {
    // Reuse the P3/P4 shared app
    appId = await getAppId(sharedClientId);
    results.P4_OKTA_CLIENT_ID = sharedClientId;
    results.P4_OKTA_CLIENT_SECRET = sharedClientSecret;
    console.log(`  [P4]      ✔  Reusing shared web app → P4_OKTA_CLIENT_ID=${sharedClientId}`);
  }

  // ── P4 AI Agent (Workload Principal) ──────────────────────────────────────
  if (env.P4_OKTA_AI_AGENT_ID) {
    console.log(`  [P4]      ⏭  AI Agent (P4_OKTA_AI_AGENT_ID already set: ${env.P4_OKTA_AI_AGENT_ID})`);
  } else if (appId) {
    const agentId = await provisionAiAgent(appId, 'okta-demo-p4-agent', 'P4');
    if (agentId) {
      await registerAgentKey(agentId, publicJwk);
      results.P4_OKTA_AI_AGENT_ID = agentId;
      console.log(`  [P4]      ✔  AI Agent → P4_OKTA_AI_AGENT_ID=${agentId}`);
      console.log(`  [P4]      ✔  Public JWK registered on AI Agent`);
    } else {
      console.log('  [P4]      ⚠  AI Agent registration unavailable — set P4_OKTA_AI_AGENT_ID manually');
    }
  }

  // ── Token-exchange policy on OKTA_AUTH_SERVER_ID ──────────────────────────
  const authzServerId = env.OKTA_AUTH_SERVER_ID;
  const clientId = env.P4_OKTA_CLIENT_ID || sharedClientId;
  if (!authzServerId) {
    console.log('  [P4]      ⚠  OKTA_AUTH_SERVER_ID not set — skipping token-exchange policy');
  } else {
    await ensureTokenExchangePolicy(authzServerId, clientId);
    console.log(`  [P4]      ✔  token-exchange policy on auth server ${authzServerId}`);
  }

  // ── OIN resources — manual steps ──────────────────────────────────────────
  if (!env.P4_GITHUB_STS_RESOURCE || !env.P4_SLACK_STS_RESOURCE) {
    console.log('  [P4]      ⚠  OIN resources: manual setup required (see end of output)');
  }

  return results;
}

async function ensureTokenExchangePolicy(authzServerId, clientId) {
  const policyName = 'Demo Token Exchange Policy';
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
      description: 'Token exchange policy for P4 STS — provisioned by setup script',
      priority: 1,
      conditions: {
        clients: { include: ['ALL_CLIENTS'] },
      },
    });
  }

  const ruleName = 'Demo Token Exchange Rule';
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
          grantTypes: {
            include: [
              'urn:ietf:params:oauth:grant-type:token-exchange',
              'urn:okta:params:oauth:grant-type:otp',
            ],
          },
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

async function getAppId(clientId) {
  try {
    const apps = await okta(`/api/v1/apps?q=${encodeURIComponent(clientId)}&limit=5`);
    const match = (apps || []).find(a => a.credentials?.oauthClient?.client_id === clientId);
    return match?.id || null;
  } catch {
    return null;
  }
}

function toPublicJwk(jwk) {
  const { d, p, q, dp, dq, qi, ...pub } = jwk;
  return pub;
}

module.exports = { provisionP4 };
