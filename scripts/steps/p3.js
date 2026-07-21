'use strict';

const { okta, pollOperation } = require('../lib/okta');
const { generateRsaJwkPair } = require('../lib/keygen');

// Shared web app label — used by both P3 and P4 WLPs.
// The web app handles user-facing PKCE/auth-code login with client_secret_basic.
// Each pattern's WLP uses its own private_key_jwt key registered on the WLP itself.
const SHARED_APP_LABEL = 'okta-demo-p3-p4-shared';

async function provisionP3(env) {
  const results = {};

  // ── Key pair for P3 WLP ───────────────────────────────────────────────────
  let privateJwk, publicJwk;
  if (env.P3_OKTA_PRIVATE_KEY) {
    console.log('  [P3]      ⏭  RSA key pair (P3_OKTA_PRIVATE_KEY already set)');
    privateJwk = JSON.parse(env.P3_OKTA_PRIVATE_KEY);
    publicJwk = toPublicJwk(privateJwk);
  } else {
    ({ privateJwk, publicJwk } = generateRsaJwkPair());
    results.P3_OKTA_PRIVATE_KEY = JSON.stringify(privateJwk);
    console.log('  [P3]      ✔  RSA-2048 key pair generated');
  }

  // ── Shared web app (P3 + P4) ──────────────────────────────────────────────
  // client_secret_basic for PKCE user login; both WLPs linked to this app.
  let appId, clientId, clientSecret;

  if (env.P3_OKTA_CLIENT_ID) {
    console.log('  [P3]      ⏭  Shared web app (P3_OKTA_CLIENT_ID already set)');
    clientId = env.P3_OKTA_CLIENT_ID;
    clientSecret = env.P3_OKTA_CLIENT_SECRET || '';
    appId = await getAppId(clientId);
    results.P3_OKTA_CLIENT_ID = clientId;
    results.P3_OKTA_CLIENT_SECRET = clientSecret;
  } else {
    const p3RedirectUri = `${env.NEXTAUTH_URL}/api/auth/callback/p3`;
    const p4RedirectUri = `${env.NEXTAUTH_URL}/api/auth/callback/p4`;
    const p4PatternUri = `${env.NEXTAUTH_URL}/patterns/p4`;
    const baseUrl = env.NEXTAUTH_URL || 'http://localhost:3020';

    let app = await findApp(SHARED_APP_LABEL);

    if (!app) {
      app = await okta('/api/v1/apps', 'POST', {
        name: 'oidc_client',
        label: SHARED_APP_LABEL,
        signOnMode: 'OPENID_CONNECT',
        credentials: {
          oauthClient: {
            token_endpoint_auth_method: 'client_secret_basic',
          },
        },
        settings: {
          oauthClient: {
            redirect_uris: [p3RedirectUri, p4RedirectUri, p4PatternUri],
            post_logout_redirect_uris: [baseUrl, `${baseUrl}/patterns/p3`, `${baseUrl}/patterns/p4`],
            response_types: ['code'],
            grant_types: [
              'authorization_code',
              'refresh_token',
              'urn:ietf:params:oauth:grant-type:token-exchange',
              'urn:openid:params:grant-type:ciba',
            ],
            application_type: 'web',
            consent_method: 'TRUSTED',
            issuer_mode: 'DYNAMIC',
            pkce_required: false,
          },
        },
      });
      console.log(`  [P3]      ✔  Shared web app created → ${app.id}`);
    } else {
      console.log(`  [P3]      ⏭  Shared web app already exists → ${app.id}`);
    }

    appId = app.id;
    clientId = app.credentials.oauthClient.client_id;
    clientSecret = app.credentials.oauthClient.client_secret || '';
    results.P3_OKTA_CLIENT_ID = clientId;
    results.P3_OKTA_CLIENT_SECRET = clientSecret;
    console.log(`  [P3]      ✔  P3_OKTA_CLIENT_ID=${clientId}`);
  }

  // ── P3 AI Agent (Workload Principal) ──────────────────────────────────────
  if (env.P3_OKTA_AI_AGENT_ID) {
    console.log(`  [P3]      ⏭  AI Agent (P3_OKTA_AI_AGENT_ID already set: ${env.P3_OKTA_AI_AGENT_ID})`);
  } else if (appId) {
    const agentId = await provisionAiAgent(appId, 'okta-demo-p3-agent');
    if (agentId) {
      await registerAgentKey(agentId, publicJwk);
      results.P3_OKTA_AI_AGENT_ID = agentId;
      console.log(`  [P3]      ✔  AI Agent → P3_OKTA_AI_AGENT_ID=${agentId}`);
      console.log(`  [P3]      ✔  Public JWK registered on AI Agent`);
    } else {
      console.log('  [P3]      ⚠  AI Agent registration unavailable — set P3_OKTA_AI_AGENT_ID manually');
    }
  }

  return results;
}

async function provisionAiAgent(appId, name, label = 'P3') {
  try {
    const res = await okta('/workload-principals/api/v1/ai-agents', 'POST', {
      appId,
      profile: { name },
    });

    // 202 Accepted — operation URL in Location header or in response body
    const operationUrl = res?._links?.operation?.href || res?.operationUrl;
    if (!operationUrl) {
      // Some versions return the agent directly (synchronous)
      return res?.id || null;
    }

    const op = await pollOperation(operationUrl);
    return op?.resource?.id || op?.resourceId || null;
  } catch (err) {
    // Beta API may not be available in all orgs — degrade gracefully
    console.log(`  [${label}]      ⚠  AI Agent API error: ${err.message}`);
    return null;
  }
}

async function registerAgentKey(agentId, publicJwk) {
  try {
    await okta(
      `/workload-principals/api/v1/ai-agents/${agentId}/credentials/jwks`,
      'POST',
      publicJwk,
    );
  } catch (err) {
    console.log(`  ⚠  JWK registration error for agent ${agentId}: ${err.message}`);
  }
}

async function findApp(label) {
  try {
    const apps = await okta(`/api/v1/apps?q=${encodeURIComponent(label)}&limit=5`);
    return (apps || []).find(a => a.label === label) || null;
  } catch {
    return null;
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

module.exports = { provisionP3, provisionAiAgent, registerAgentKey, findApp };
