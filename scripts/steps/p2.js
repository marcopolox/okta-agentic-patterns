'use strict';

const { okta } = require('../lib/okta');

async function provisionP2(env) {
  const results = {};

  if (env.P2_OKTA_CLIENT_ID) {
    console.log('  [P2]      ⏭  OAuth app (P2_OKTA_CLIENT_ID already set)');
    results.P2_OKTA_CLIENT_ID = env.P2_OKTA_CLIENT_ID;
    results.P2_OKTA_CLIENT_SECRET = env.P2_OKTA_CLIENT_SECRET || '';
    return results;
  }

  const redirectUri = `${env.NEXTAUTH_URL}/api/auth/callback/p2`;
  const appLabel = 'okta-demo-p2-consumer-agent';

  let app = await findApp(appLabel);

  if (!app) {
    app = await okta('/api/v1/apps', 'POST', {
      name: 'oidc_client',
      label: appLabel,
      signOnMode: 'OPENID_CONNECT',
      credentials: {
        oauthClient: {
          token_endpoint_auth_method: 'client_secret_basic',
        },
      },
      settings: {
        oauthClient: {
          redirect_uris: [redirectUri],
          response_types: ['code'],
          grant_types: [
            'authorization_code',
            'client_credentials',
            'refresh_token',
            'urn:ietf:params:oauth:grant-type:token-exchange',
          ],
          application_type: 'web',
          consent_method: 'TRUSTED',
          issuer_mode: 'DYNAMIC',
          pkce_required: true,
        },
      },
    });
    console.log(`  [P2]      ✔  OAuth app created → ${app.id}`);
  } else {
    console.log(`  [P2]      ⏭  OAuth app already exists → ${app.id}`);
  }

  results.P2_OKTA_CLIENT_ID = app.credentials.oauthClient.client_id;
  results.P2_OKTA_CLIENT_SECRET = app.credentials.oauthClient.client_secret || '';

  console.log(`  [P2]      ✔  P2_OKTA_CLIENT_ID=${results.P2_OKTA_CLIENT_ID}`);
  return results;
}

async function findApp(label) {
  try {
    const apps = await okta(`/api/v1/apps?q=${encodeURIComponent(label)}&limit=5`);
    return (apps || []).find(a => a.label === label) || null;
  } catch {
    return null;
  }
}

module.exports = { provisionP2 };
