'use strict';

let _baseUrl = '';
let _token = '';

function init(domain, ssws) {
  _baseUrl = `https://${domain}`;
  _token = ssws;
}

async function okta(path, method = 'GET', body = undefined) {
  const url = path.startsWith('http') ? path : `${_baseUrl}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `SSWS ${_token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 204) return null;

  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }

  if (!res.ok) {
    const msg = data?.errorSummary || data?.error_description || data?.message || text;
    throw new Error(`Okta API ${method} ${path} → ${res.status}: ${msg}`);
  }

  return data;
}

async function pollOperation(operationUrl) {
  for (let i = 0; i < 30; i++) {
    await sleep(2000);
    const op = await okta(operationUrl);
    if (op.status === 'COMPLETED') return op;
    if (op.status === 'FAILED') {
      throw new Error(`Operation failed: ${JSON.stringify(op.error || op)}`);
    }
  }
  throw new Error(`Operation timed out after 60s: ${operationUrl}`);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

module.exports = { init, okta, pollOperation };
