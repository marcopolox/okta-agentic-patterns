'use strict';

const { okta } = require('../lib/okta');

const COMMON_GRANT_TYPES = [
  'authorization_code',
  'client_credentials',
  'urn:ietf:params:oauth:grant-type:jwt-bearer',
  'urn:ietf:params:oauth:grant-type:device_code',
];

// Each auth server definition: name, audience, scopes, and which grant types to allow in the policy rule
const AUTH_SERVERS = [
  {
    name: 'okta-demo-hr',
    audience: 'api:hr',
    scopes: ['hr:read', 'hr:write', 'hr:delete', 'interclient_access', 'mcp:read', 'mcp:write'],
    grantTypes: COMMON_GRANT_TYPES,
    envPrefix: 'HR',
  },
  {
    name: 'okta-demo-finance',
    audience: 'api:finance',
    scopes: ['finance:read', 'finance:write', 'finance:approve', 'interclient_access', 'mcp:read', 'mcp:write'],
    grantTypes: COMMON_GRANT_TYPES,
    envPrefix: 'FINANCE',
  },
  {
    name: 'okta-demo-inventory',
    audience: 'api://inventory-resource',
    scopes: ['inventory:read', 'inventory:write'],
    grantTypes: [
      'authorization_code',
      'client_credentials',
      'urn:ietf:params:oauth:grant-type:device_code',
      'urn:openid:params:grant-type:ciba',
    ],
    envPrefix: 'INVENTORY',
  },
];

async function provisionShared(env) {
  const results = {};

  for (const def of AUTH_SERVERS) {
    const authzServerIdKey = `${def.envPrefix}_AUTHZ_SERVER_ID`;
    const audienceKey = `${def.envPrefix}_RESOURCE_AUDIENCE`;

    // Skip if already set
    if (env[authzServerIdKey]) {
      console.log(`  [Shared]  ⏭  ${def.name} (${authzServerIdKey} already set)`);
      results[authzServerIdKey] = env[authzServerIdKey];
      results[audienceKey] = env[audienceKey] || def.audience;
      continue;
    }

    // Check if auth server already exists
    let serverId;
    try {
      const existing = await okta(`/api/v1/authorizationServers?q=${encodeURIComponent(def.name)}`);
      const match = Array.isArray(existing) && existing.find(s => s.name === def.name);
      if (match) {
        serverId = match.id;
        console.log(`  [Shared]  ⏭  ${def.name} already exists → ${serverId}`);
      }
    } catch { /* query failed — will try to create */ }

    if (!serverId) {
      const created = await okta('/api/v1/authorizationServers', 'POST', {
        name: def.name,
        description: `Okta Agentic Demo — ${def.envPrefix} resource server`,
        audiences: [def.audience],
      });
      serverId = created.id;
      console.log(`  [Shared]  ✔  Created ${def.name} → ${serverId}`);
    }

    // Create scopes (idempotent — skip if already present)
    await ensureScopes(serverId, def.scopes);

    // Create policy + rule for required grant types
    await ensurePolicy(serverId, def.name, def.grantTypes);

    results[authzServerIdKey] = serverId;
    results[audienceKey] = def.audience;
    console.log(`  [Shared]  ✔  ${authzServerIdKey}=${serverId}  ${audienceKey}=${def.audience}`);
  }

  return results;
}

async function ensureScopes(serverId, scopeNames) {
  let existing = [];
  try {
    existing = await okta(`/api/v1/authorizationServers/${serverId}/scopes`);
  } catch { /* empty server */ }
  const existingNames = new Set((existing || []).map(s => s.name));

  for (const name of scopeNames) {
    if (existingNames.has(name)) continue;
    await okta(`/api/v1/authorizationServers/${serverId}/scopes`, 'POST', {
      name,
      description: `${name} scope`,
      consent: 'IMPLICIT',
      metadataPublish: 'ALL_CLIENTS',
    });
  }
}

async function ensurePolicy(serverId, serverName, grantTypes) {
  const policyName = 'Demo Policy';
  let policies = [];
  try {
    policies = await okta(`/api/v1/authorizationServers/${serverId}/policies`);
  } catch { /* none yet */ }

  let policy = (policies || []).find(p => p.name === policyName);
  if (!policy) {
    policy = await okta(`/api/v1/authorizationServers/${serverId}/policies`, 'POST', {
      type: 'OAUTH_AUTHORIZATION_POLICY',
      status: 'ACTIVE',
      name: policyName,
      description: 'Provisioned by setup script — allows all clients',
      priority: 1,
      conditions: {
        clients: { include: ['ALL_CLIENTS'] },
      },
    });
  }

  const ruleName = 'Demo Rule';
  let rules = [];
  try {
    rules = await okta(`/api/v1/authorizationServers/${serverId}/policies/${policy.id}/rules`);
  } catch { /* none yet */ }

  const existingRule = (rules || []).find(r => r.name === ruleName);
  if (!existingRule) {
    await okta(
      `/api/v1/authorizationServers/${serverId}/policies/${policy.id}/rules`,
      'POST',
      {
        type: 'RESOURCE_ACCESS',
        status: 'ACTIVE',
        name: ruleName,
        priority: 1,
        conditions: {
          people: { users: { include: [], exclude: [] }, groups: { include: ['EVERYONE'], exclude: [] } },
          grantTypes: { include: grantTypes },
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

module.exports = { provisionShared };
