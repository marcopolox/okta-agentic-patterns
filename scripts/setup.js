#!/usr/bin/env node
'use strict';

const readline = require('node:readline');
const { init, okta } = require('./lib/okta');
const { readEnv, writeEnv } = require('./lib/env');
const { provisionShared } = require('./steps/shared');
const { provisionP2 } = require('./steps/p2');
const { provisionP3 } = require('./steps/p3');
const { provisionP4 } = require('./steps/p4');
const { provisionP6 } = require('./steps/p6');

const DIVIDER = '─'.repeat(60);

async function main() {
  console.log('\nOkta Agentic Demo — Provisioning');
  console.log(DIVIDER);

  // ── Read .env ──────────────────────────────────────────────────────────────
  let env;
  try {
    env = readEnv();
  } catch (err) {
    console.error(`\n✘  ${err.message}\n`);
    process.exit(1);
  }

  const domain = env.OKTA_DOMAIN;
  if (!domain) {
    console.error('\n✘  OKTA_DOMAIN is not set in .env');
    console.error('   Copy .env.example → .env and fill in the STEP 1 values first.\n');
    process.exit(1);
  }
  console.log(`Reading .env...  ✔  OKTA_DOMAIN=${domain}`);

  const nextauthUrl = env.NEXTAUTH_URL || 'http://localhost:3020';
  if (!env.NEXTAUTH_URL) {
    console.log(`  NEXTAUTH_URL not set — using default: ${nextauthUrl}`);
  }

  // ── SSWS token ─────────────────────────────────────────────────────────────
  console.log('');
  console.log('SSWS Admin Token  (not saved to .env — used only during setup)');
  console.log('  Okta Admin → Security → API → Tokens → Create Token');
  const ssws = await prompt('  → ');

  if (!ssws.trim()) {
    console.error('\n✘  No token provided. Exiting.\n');
    process.exit(1);
  }

  // ── Validate connection ────────────────────────────────────────────────────
  init(domain, ssws.trim());
  console.log('');
  try {
    const org = await okta('/api/v1/org');
    console.log(`✔  Connected: ${org.companyName || org.name} (${domain})\n`);
  } catch (err) {
    console.error(`\n✘  Could not connect to Okta: ${err.message}`);
    console.error('   Check your OKTA_DOMAIN and SSWS token.\n');
    process.exit(1);
  }

  // ── Provision ──────────────────────────────────────────────────────────────
  console.log('Provisioning Okta resources...\n');
  const allResults = {};

  // Computed vars (no API call needed)
  if (!env.NEXT_PUBLIC_OKTA_DOMAIN) {
    allResults.NEXT_PUBLIC_OKTA_DOMAIN = domain;
  }
  if (!env.OKTA_ISSUER && env.OKTA_AUTH_SERVER_ID) {
    allResults.OKTA_ISSUER = `https://${domain}/oauth2/${env.OKTA_AUTH_SERVER_ID}`;
  }

  // Merge computed results into env view for steps that read these vars
  const mergedEnv = { ...env, NEXTAUTH_URL: nextauthUrl, ...allResults };

  // Shared auth servers
  try {
    Object.assign(allResults, await provisionShared(mergedEnv));
    Object.assign(mergedEnv, allResults);
  } catch (err) {
    console.error(`\n  [Shared]  ✘  ${err.message}`);
  }

  // P2
  try {
    Object.assign(allResults, await provisionP2(mergedEnv));
    Object.assign(mergedEnv, allResults);
  } catch (err) {
    console.error(`\n  [P2]      ✘  ${err.message}`);
  }

  // P3
  try {
    Object.assign(allResults, await provisionP3(mergedEnv));
    Object.assign(mergedEnv, allResults);
  } catch (err) {
    console.error(`\n  [P3]      ✘  ${err.message}`);
  }

  // P4
  try {
    Object.assign(allResults, await provisionP4(mergedEnv));
    Object.assign(mergedEnv, allResults);
  } catch (err) {
    console.error(`\n  [P4]      ✘  ${err.message}`);
  }

  // P6
  try {
    Object.assign(allResults, await provisionP6(mergedEnv));
    Object.assign(mergedEnv, allResults);
  } catch (err) {
    console.error(`\n  [P6]      ✘  ${err.message}`);
  }

  // ── Write .env ─────────────────────────────────────────────────────────────
  const count = Object.keys(allResults).length;
  if (count > 0) {
    writeEnv(allResults);
    console.log(`\n✔  .env updated (${count} variable${count === 1 ? '' : 's'} provisioned)\n`);
  } else {
    console.log('\n✔  Nothing new to write — .env already fully configured\n');
  }

  // ── Manual steps ───────────────────────────────────────────────────────────
  const needsGithub = !mergedEnv.P4_GITHUB_STS_RESOURCE;
  const needsSlack = !mergedEnv.P4_SLACK_STS_RESOURCE;

  if (needsGithub || needsSlack) {
    console.log(DIVIDER);
    console.log('Manual steps required for P4\n');

    if (needsGithub) {
      console.log('P4_GITHUB_STS_RESOURCE — GitHub Enterprise OIN integration:');
      console.log('  1. Okta Admin → Applications → Browse App Catalog → GitHub Enterprise');
      console.log('  2. Enable STS integration → copy the resource ORN');
      console.log('  3. Add to .env:  P4_GITHUB_STS_RESOURCE=orn:okta:...\n');
    }

    if (needsSlack) {
      console.log('P4_SLACK_STS_RESOURCE — Slack OIN integration:');
      console.log('  1. Okta Admin → Applications → Browse App Catalog → Slack');
      console.log('  2. Enable STS → install with scopes: chat:write, chat:write.public, channels:read');
      console.log('  3. Add to .env:  P4_SLACK_STS_RESOURCE=orn:okta:...\n');
    }
    console.log(DIVIDER);
  }

  console.log('\nNext:  docker compose up\n');
}

function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer);
    });
  });
}

main().catch(err => {
  console.error(`\n✘  Unexpected error: ${err.message}\n`);
  process.exit(1);
});
