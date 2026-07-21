'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ENV_PATH = path.resolve(__dirname, '../../.env');

function readEnv() {
  if (!fs.existsSync(ENV_PATH)) {
    throw new Error(`.env not found at ${ENV_PATH}\nCopy .env.example → .env and fill in the STEP 1 values first.`);
  }
  const lines = fs.readFileSync(ENV_PATH, 'utf8').split('\n');
  const vars = {};
  for (const line of lines) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    const [, key, val] = match;
    const trimmed = val.trim();
    if (trimmed !== '') vars[key] = trimmed;
  }
  return vars;
}

function writeEnv(updates) {
  if (!fs.existsSync(ENV_PATH)) {
    throw new Error(`.env not found at ${ENV_PATH}`);
  }
  let content = fs.readFileSync(ENV_PATH, 'utf8');

  for (const [key, value] of Object.entries(updates)) {
    const stringVal = String(value);
    // Replace blank assignment: KEY= or KEY=   (with optional trailing comment)
    const blankRe = new RegExp(`^(${key}=)(\\s*)(#.*)?$`, 'm');
    if (blankRe.test(content)) {
      content = content.replace(blankRe, `$1${stringVal}`);
    } else {
      // Key not present at all — append
      content += `\n${key}=${stringVal}`;
    }
  }

  fs.writeFileSync(ENV_PATH, content, 'utf8');
}

module.exports = { readEnv, writeEnv, ENV_PATH };
