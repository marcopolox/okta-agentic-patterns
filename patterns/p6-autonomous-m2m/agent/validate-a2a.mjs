#!/usr/bin/env node
// Phase 0 — validate the P6 A2A delegation chain against the live Okta org.
// Run from the agent dir so `jose` resolves:
//   node ../scripts/validate-a2a.mjs            (from patterns/p6-autonomous-m2m/agent)
// or: (cd patterns/p6-autonomous-m2m/agent && node ../scripts/validate-a2a.mjs)
//
// Walks: Step 0 (orchestrator identity token) → Step 1/2 (orchestrator→worker A2A
// token) → Step 3 (worker token-exchanges the A2A token for a domain token).
// Each step runs only if its required env vars are present; missing steps are
// skipped with a note so this is useful before the worker side is provisioned.
//
// CONFIRM-THEN-LOCK: the [verify] params from the plan are centralized in CFG
// below. Tweak them here, observe the result, then bake the winners into code.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { SignJWT, importJWK, importPKCS8, decodeJwt } from "jose";

// ── .env loader (comment-on-preceding-line convention; keeps JSON values intact)
function loadEnv() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
  const raw = readFileSync(resolve(root, ".env"), "utf8");
  const env = {};
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1);
    // strip a trailing " # comment" only for non-JSON scalar values
    if (!val.trimStart().startsWith("{") && !val.trimStart().startsWith("[")) {
      val = val.replace(/\s+#.*$/, "");
    }
    env[key] = val.trim();
  }
  return env;
}

const E = loadEnv();
const DOMAIN = E.OKTA_DOMAIN;
const ORG_TOKEN_URL = `https://${DOMAIN}/oauth2/v1/token`;

// ── [verify] knobs — adjust then re-run until the chain succeeds ───────────────
// Usage:
//   User sign-on mode (default):
//     P6_SUBJECT_TOKEN=eyJ... node validate-a2a.mjs      (or)   node validate-a2a.mjs eyJ...
//     Provide the user's id_token from the p6_id_token cookie after logging in at /patterns/p6.
//
//   CC/autonomous mode:
//     node validate-a2a.mjs --cc
//     Acquires a fresh CC token via client_credentials using P6_ORCHESTRATOR_OKTA_CLIENT_ID +
//     P6_ORCHESTRATOR_OKTA_CLIENT_SECRET + P6_ORCH_A2A_AUTHZ_SERVER_ID + P6_ORCH_A2A_RESOURCE.
const CC_MODE = process.argv.includes("--cc");
const SUBJECT_TOKEN = process.argv.find((a) => a !== "--cc" && !a.startsWith("node") && !a.endsWith(".mjs")) || E.P6_SUBJECT_TOKEN || "";
const CFG = {
  requestedTokenType: "urn:ietf:params:oauth:token-type:id-jag",
  // orchestrator hop: subject = user id_token (P3-style) or CC access_token (autonomous mode)
  orchestratorSubjectType: CC_MODE
    ? "urn:ietf:params:oauth:token-type:access_token"
    : "urn:ietf:params:oauth:token-type:id_token",
  // Worker downstream: the inbound token from Step 2 is a regular access_token.
  workerSubjectType: "urn:ietf:params:oauth:token-type:access_token",
  // Step 1: audience = worker A2A AS issuer URL; resource = worker HTTPS resourceUrl (https://hr.agent / https://fin.agent)
  step1IncludeScope: true,
  a2aScope: "agent.invoke",
  // SKIP_STEP2: false = do Step 2 token-exchange at worker A2A AS (the intended path)
  skipStep2: false,
};

function show(label, token, verbose = false) {
  if (!token) return;
  try {
    const c = decodeJwt(token);
    console.log(`    ${label} claims: iss=${c.iss} sub=${c.sub} aud=${JSON.stringify(c.aud)} scp=${JSON.stringify(c.scp ?? c.scope)} cid=${c.cid ?? "-"} act=${c.act ? JSON.stringify(c.act) : "-"}`);
    if (verbose) console.log(`    ${label} full: ${JSON.stringify(c, null, 2)}`);
  } catch {
    console.log(`    ${label}: opaque token (${token.slice(0, 10)}…)`);
  }
}

async function signAssertion(aiAgentId, privateKeyStr, audience) {
  let key, kid;
  try {
    const jwk = JSON.parse(privateKeyStr);
    kid = jwk.kid;
    key = await importJWK(jwk, "RS256");
  } catch {
    key = await importPKCS8(privateKeyStr, "RS256");
  }
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: "RS256", ...(kid ? { kid } : {}) })
    .setIssuer(aiAgentId).setSubject(aiAgentId).setAudience(audience)
    .setIssuedAt(now).setExpirationTime(now + 300).setJti(crypto.randomUUID())
    .sign(key);
}

async function post(url, params, what) {
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const text = await resp.text();
  let json; try { json = JSON.parse(text); } catch { json = null; }
  if (!resp.ok) {
    console.log(`  ❌ ${what} FAILED (${resp.status}): ${text.slice(0, 400)}`);
    return null;
  }
  console.log(`  ✅ ${what} OK (${resp.status})`);
  return json;
}

// ── Step 0 (user sign-on mode): paste the p6_id_token cookie from /patterns/p6.
function step0UserSignOn() {
  console.log(`\n[Step 0] User subject token (from sign-on)`);
  if (!SUBJECT_TOKEN) {
    console.log("  ⏭  skipped — provide the user token via P6_SUBJECT_TOKEN=… or as arg1 (log in at /patterns/p6, copy the p6_id_token cookie)");
    return null;
  }
  show("user token", SUBJECT_TOKEN);
  return SUBJECT_TOKEN;
}

// ── Step 0 (CC/autonomous mode): acquire a fresh CC token from the orch A2A AS.
async function step0CcGrant() {
  const clientId = E.P6_ORCHESTRATOR_OKTA_CLIENT_ID;
  const clientSecret = E.P6_ORCHESTRATOR_OKTA_CLIENT_SECRET;
  const authzServerId = E.P6_ORCH_A2A_AUTHZ_SERVER_ID;
  const resource = E.P6_ORCH_A2A_RESOURCE;

  console.log(`\n[Step 0 — CC] Client Credentials grant`);
  console.log(`  tokenUrl: https://${DOMAIN}/oauth2/${authzServerId}/v1/token`);
  console.log(`  client_id: ${clientId}`);
  console.log(`  resource: ${resource}`);

  if (!clientId || !clientSecret || !authzServerId) {
    console.log("  ⏭  skipped — need P6_ORCHESTRATOR_OKTA_CLIENT_ID + P6_ORCHESTRATOR_OKTA_CLIENT_SECRET + P6_ORCH_A2A_AUTHZ_SERVER_ID in .env");
    return null;
  }

  const tokenUrl = `https://${DOMAIN}/oauth2/${authzServerId}/v1/token`;
  const params = {
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    scope: "agent.invoke",
  };
  if (resource) params.resource = resource;

  const result = await post(tokenUrl, params, "Step 0 CC grant");
  if (!result) return null;
  show("CC token", result.access_token);
  return result.access_token;
}

// ── Step 0b: probe whether the orchestrator client is accepted on a given AS ────
async function probeClientOnAs(asId, label) {
  console.log(`\n[Probe] Is orchestrator client accepted on ${label} AS (${asId})?`);
  const tokenUrl = `https://${DOMAIN}/oauth2/${asId}/v1/token`;
  // Try a minimal CC grant — if client is unknown to this AS it returns access_denied immediately.
  const resp = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: E.P6_ORCHESTRATOR_OKTA_CLIENT_ID,
      client_secret: E.P6_ORCHESTRATOR_OKTA_CLIENT_SECRET,
      scope: "agent.invoke",
    }),
  });
  const text = await resp.text();
  let json; try { json = JSON.parse(text); } catch { json = null; }
  console.log(`  HTTP ${resp.status}: ${text.slice(0, 300)}`);
  return { status: resp.status, json };
}

// ── Step 1+2: orchestrator → worker A2A token ──────────────────────────────────
async function exchangeForWorker(subjectToken, workerLabel, resourceUrl, a2aAuthzServerId, actorToken) {
  console.log(`\n[Step 1/2] A2A token for ${workerLabel}  (audience=${resourceUrl} as=${a2aAuthzServerId})`);
  if (!subjectToken || !resourceUrl || !a2aAuthzServerId) {
    console.log("  ⏭  skipped — need orchestrator token + P6_*_WORKER_RESOURCE_URL + P6_*_WORKER_A2A_AUTHZ_SERVER_ID");
    return null;
  }
  const workerIssuer = `https://${DOMAIN}/oauth2/${a2aAuthzServerId}`;
  const audience = workerIssuer;   // AS issuer URL
  const resource = resourceUrl;    // HTTPS resource URL (https://hr.agent / https://fin.agent)

  // Step 1: token-exchange → ID-JAG (client assertion = orchestrator wlp)
  const s1Assertion = await signAssertion(E.P6_ORCHESTRATOR_OKTA_AI_AGENT_ID, E.P6_ORCHESTRATOR_OKTA_PRIVATE_KEY, ORG_TOKEN_URL);
  const s1Params = {
    grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
    requested_token_type: CFG.requestedTokenType,
    subject_token: subjectToken,
    subject_token_type: CFG.orchestratorSubjectType,
    audience,
    resource,
    client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
    client_assertion: s1Assertion,
  };
  if (CFG.step1IncludeScope) s1Params.scope = CFG.a2aScope;
  const s1 = await post(ORG_TOKEN_URL, s1Params, "Step 1 (ID-JAG)");
  if (!s1) return null;
  const idJag = s1.access_token;
  show("ID-JAG", idJag, true);

  if (CFG.skipStep2) {
    console.log(`  ⏭  Step 2 skipped — treating ID-JAG as direct A2A credential`);
    return idJag;
  }

  // Step 2: jwt-bearer at worker A2A AS → A2A resource token (same pattern as P3 Step 2)
  const s2TokenUrl = `${workerIssuer}/v1/token`;
  const s2Assertion = await signAssertion(E.P6_ORCHESTRATOR_OKTA_AI_AGENT_ID, E.P6_ORCHESTRATOR_OKTA_PRIVATE_KEY, s2TokenUrl);
  const s2Params = {
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion: idJag,
    client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
    client_assertion: s2Assertion,
  };
  const s2 = await post(s2TokenUrl, s2Params, "Step 2 (A2A resource token)");
  if (!s2) return null;
  show("A2A token", s2.access_token);
  return s2.access_token;
}

// ── Step 3: worker token-exchanges the A2A token for a domain token ────────────
async function workerDownstream(a2aToken, workerLabel, workerAiAgentId, workerKey, domainAuthzServerId, domainAudience) {
  console.log(`\n[Step 3] ${workerLabel} downstream exchange  (domain AS=${domainAuthzServerId} aud=${domainAudience})`);
  if (!a2aToken || !workerAiAgentId || !workerKey || !domainAuthzServerId) {
    console.log("  ⏭  skipped — need A2A token + P6_*_WORKER_OKTA_AI_AGENT_ID + P6_*_WORKER_PRIVATE_KEY + domain AS");
    return null;
  }
  const domainIssuer = `https://${DOMAIN}/oauth2/${domainAuthzServerId}`;
  // Step 3a: token-exchange A2A token → ID-JAG for the domain AS (assertion = worker wlp)
  const a = await signAssertion(workerAiAgentId, workerKey, ORG_TOKEN_URL);
  const s3a = await post(ORG_TOKEN_URL, {
    grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
    requested_token_type: CFG.requestedTokenType,
    subject_token: a2aToken,
    subject_token_type: CFG.workerSubjectType,
    audience: domainIssuer,
    scope: domainAudience?.includes("finance") ? "finance:read" : "hr:read",
    client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
    client_assertion: a,
  }, "Step 3a (worker→domain ID-JAG)");
  if (!s3a) return null;
  show("domain ID-JAG", s3a.access_token);
  // Step 3b: jwt-bearer → domain resource token
  const s3bUrl = `${domainIssuer}/v1/token`;
  const b = await signAssertion(workerAiAgentId, workerKey, s3bUrl);
  const s3b = await post(s3bUrl, {
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion: s3a.access_token,
    client_assertion_type: "urn:ietf:params:oauth:client-assertion-type:jwt-bearer",
    client_assertion: b,
  }, "Step 3b (worker domain resource token)");
  if (!s3b) return null;
  show("domain token", s3b.access_token);
  return s3b.access_token;
}

async function main() {
  console.log(`P6 A2A chain validation — org ${DOMAIN}  mode=${CC_MODE ? "CC/autonomous" : "user sign-on"}`);
  const orchToken = CC_MODE ? await step0CcGrant() : step0UserSignOn();

  // Probe: can the orchestrator client authenticate to each worker A2A AS at all?
  await probeClientOnAs(E.P6_HR_WORKER_A2A_AUTHZ_SERVER_ID, "HR Worker A2A");
  await probeClientOnAs(E.P6_FINANCE_WORKER_A2A_AUTHZ_SERVER_ID, "Finance Worker A2A");

  const hrA2a = await exchangeForWorker(orchToken, "HR Worker", E.P6_HR_WORKER_RESOURCE_URL, E.P6_HR_WORKER_A2A_AUTHZ_SERVER_ID, CC_MODE ? orchToken : undefined);
  await workerDownstream(hrA2a, "HR Worker", E.P6_HR_WORKER_OKTA_AI_AGENT_ID, E.P6_HR_WORKER_PRIVATE_KEY, E.HR_AUTHZ_SERVER_ID, E.HR_RESOURCE_AUDIENCE);

  const finA2a = await exchangeForWorker(orchToken, "Finance Worker", E.P6_FINANCE_WORKER_RESOURCE_URL, E.P6_FINANCE_WORKER_A2A_AUTHZ_SERVER_ID, CC_MODE ? orchToken : undefined);
  await workerDownstream(finA2a, "Finance Worker", E.P6_FINANCE_WORKER_OKTA_AI_AGENT_ID, E.P6_FINANCE_WORKER_PRIVATE_KEY, E.FINANCE_AUTHZ_SERVER_ID, E.FINANCE_RESOURCE_AUDIENCE);

  console.log("\nDone. Lock the working CFG values into the agent/worker code.");
}

main().catch((e) => { console.error(e); process.exit(1); });
