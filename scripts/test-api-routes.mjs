import assert from 'node:assert/strict';

import createHandler from '../api/key/create.mjs';
import statusHandler from '../api/key/status.mjs';
import syncHandler from '../api/key/sync.mjs';
import revokeHandler from '../api/key/revoke.mjs';

const env = {
  ...process.env,
  VENICE_ADMIN_API_KEY: 'admin-secret-never-return',
  KEY_ENCRYPTION_SECRET: 'test-secret-32-bytes-minimum-value',
  WSTDIEM_RESERVE_BPS: '8000',
  ALLOW_CLIENT_BALANCE_OVERRIDE: 'true',
};

const originalEnv = process.env;
process.env = env;

const keys = new Map();
let counter = 0;
globalThis.fetch = async (url, init = {}) => {
  const parsed = new URL(url);
  const method = init.method || 'GET';
  const body = init.body ? JSON.parse(init.body) : null;
  assert.equal(init.headers?.Authorization, `Bearer ${env.VENICE_ADMIN_API_KEY}`);
  if (parsed.pathname.endsWith('/api_keys') && method === 'POST') {
    counter += 1;
    const id = `route-key-${counter}`;
    const apiKey = `route-user-secret-${counter}`;
    keys.set(id, {
      id,
      apiKeyType: body.apiKeyType,
      description: body.description,
      consumptionLimits: body.consumptionLimit,
      limitPeriod: body.limitPeriod,
      currentPeriodUsage: { diem: '0', usd: '0' },
      last6Chars: apiKey.slice(-6),
    });
    return jsonResponse(200, { data: { id, apiKey, apiKeyType: body.apiKeyType, consumptionLimit: body.consumptionLimit, limitPeriod: body.limitPeriod } });
  }
  if (parsed.pathname.endsWith('/api_keys') && method === 'GET') {
    return jsonResponse(200, { data: [...keys.values()], object: 'list' });
  }
  if (parsed.pathname.endsWith('/api_keys') && method === 'PATCH') {
    const key = keys.get(body.id);
    key.consumptionLimits = body.consumptionLimit;
    return jsonResponse(200, { data: key });
  }
  if (parsed.pathname.endsWith('/api_keys') && method === 'DELETE') {
    keys.delete(parsed.searchParams.get('id'));
    return jsonResponse(200, { success: true });
  }
  throw new Error(`unexpected ${method} ${parsed.pathname}`);
};

function jsonResponse(status, payload) {
  return { ok: status >= 200 && status < 300, status, async text() { return JSON.stringify(payload); } };
}

function req(method, body) {
  return { method, body };
}

function res() {
  const out = { statusCode: 200, body: undefined, headers: {} };
  out.status = (code) => { out.statusCode = code; return out; };
  out.setHeader = (key, value) => { out.headers[key] = value; };
  out.json = (body) => { out.body = body; return out; };
  out.end = (body) => { out.body = body; return out; };
  return out;
}

let response = res();
await createHandler(req('POST', {
  address: '0x0000000000000000000000000000000000000abc',
  effectiveWstDiemWei: '100000000000000000',
}), response);
assert.equal(response.statusCode, 200);
assert.equal(response.body.targetLimitDiem, '0.08');
assert.ok(response.body.apiKey.startsWith('route-user-secret'));
assert.ok(response.body.keyToken);
assert.equal(JSON.stringify(response.body).includes(env.VENICE_ADMIN_API_KEY), false);

const token = response.body.keyToken;
response = res();
await statusHandler(req('POST', { keyToken: token }), response);
assert.equal(response.statusCode, 200);
assert.equal(response.body.status, 'active');
assert.equal(response.body.limitDiem, 0.08);
assert.equal(JSON.stringify(response.body).includes('route-user-secret'), false);

response = res();
await syncHandler(req('POST', { keyToken: token, effectiveWstDiemWei: '50000000000000000' }), response);
assert.equal(response.statusCode, 200);
assert.equal(response.body.action, 'patched');
assert.equal(response.body.targetLimitDiem, '0.04');

response = res();
await revokeHandler(req('POST', { keyToken: token }), response);
assert.equal(response.statusCode, 200);
assert.equal(response.body.success, true);
assert.equal(keys.size, 0);

process.env = originalEnv;
console.log('api route tests passed');
