import assert from 'node:assert/strict';
import {
  createInferenceKey,
  decodeKeyToken,
  getKeyStatus,
  revokeInferenceKey,
  syncInferenceKeyLimit,
  targetDiemLimitFromWei,
} from '../api/lib/key-manager.mjs';

const env = {
  VENICE_ADMIN_API_KEY: 'admin-secret-never-return',
  KEY_ENCRYPTION_SECRET: 'test-secret-32-bytes-minimum-value',
  WSTDIEM_RESERVE_BPS: '8000',
};

function makeMockFetch() {
  const calls = [];
  const keys = new Map();
  let counter = 0;
  async function mockFetch(url, init = {}) {
    const parsed = new URL(url);
    const method = init.method || 'GET';
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ url, path: parsed.pathname, method, headers: init.headers || {}, body });

    assert.equal(init.headers?.Authorization, `Bearer ${env.VENICE_ADMIN_API_KEY}`);

    if (parsed.pathname.endsWith('/api_keys') && method === 'POST') {
      counter += 1;
      const id = `key-${counter}`;
      const apiKey = `venice-user-secret-${counter}`;
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

    if (parsed.pathname.endsWith('/api_keys') && method === 'PATCH') {
      const key = keys.get(body.id);
      assert.ok(key, 'patch key exists');
      key.consumptionLimits = body.consumptionLimit;
      key.limitPeriod = body.limitPeriod;
      return jsonResponse(200, { data: key });
    }

    if (parsed.pathname.endsWith('/api_keys') && method === 'DELETE') {
      const id = parsed.searchParams.get('id');
      keys.delete(id);
      return jsonResponse(200, { success: true });
    }

    if (parsed.pathname.endsWith('/api_keys') && method === 'GET') {
      return jsonResponse(200, { data: [...keys.values()], object: 'list' });
    }

    throw new Error(`unexpected fetch ${method} ${parsed.pathname}`);
  }
  return { fetch: mockFetch, calls, keys };
}

function jsonResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() { return payload; },
    async text() { return JSON.stringify(payload); },
  };
}

assert.equal(targetDiemLimitFromWei('500000000000000000', env), '0.4');
assert.equal(targetDiemLimitFromWei('1', env), '0.0000000000000000008');
assert.equal(targetDiemLimitFromWei('0', env), '0');

const mock = makeMockFetch();
const created = await createInferenceKey({
  env,
  fetchImpl: mock.fetch,
  address: '0x0000000000000000000000000000000000000abc',
  effectiveWstDiemWei: '500000000000000000',
});

assert.equal(created.veniceKeyId, 'key-1');
assert.equal(created.apiKey, 'venice-user-secret-1');
assert.ok(created.keyToken, 'key token returned');
assert.equal(JSON.stringify(created).includes(env.VENICE_ADMIN_API_KEY), false, 'admin key never returned');
assert.equal(mock.calls[0].body.apiKeyType, 'INFERENCE');
assert.equal(mock.calls[0].body.limitPeriod, 'EPOCH');
assert.equal(mock.calls[0].body.consumptionLimit.diem, 0.4);

const decoded = decodeKeyToken({ env, token: created.keyToken });
assert.equal(decoded.address, '0x0000000000000000000000000000000000000abc');
assert.equal(decoded.veniceKeyId, 'key-1');

const status = await getKeyStatus({ env, fetchImpl: mock.fetch, keyToken: created.keyToken });
assert.equal(status.veniceKeyId, 'key-1');
assert.equal(status.limitDiem, 0.4);
assert.equal(JSON.stringify(status).includes('venice-user-secret'), false, 'user api key is reveal-only, not in status');

const synced = await syncInferenceKeyLimit({
  env,
  fetchImpl: mock.fetch,
  keyToken: created.keyToken,
  effectiveWstDiemWei: '250000000000000000',
});
assert.equal(synced.action, 'patched');
assert.equal(synced.targetLimitDiem, '0.2');
assert.equal(mock.keys.get('key-1').consumptionLimits.diem, 0.2);

const revokedByZero = await syncInferenceKeyLimit({
  env,
  fetchImpl: mock.fetch,
  keyToken: created.keyToken,
  effectiveWstDiemWei: '0',
});
assert.equal(revokedByZero.action, 'revoked');
assert.equal(mock.keys.has('key-1'), false);

const mock2 = makeMockFetch();
const created2 = await createInferenceKey({
  env,
  fetchImpl: mock2.fetch,
  address: '0x0000000000000000000000000000000000000abc',
  effectiveWstDiemWei: '100000000000000000',
});
const revoked = await revokeInferenceKey({ env, fetchImpl: mock2.fetch, keyToken: created2.keyToken });
assert.equal(revoked.success, true);
assert.equal(mock2.keys.has('key-1'), false);

console.log('key manager tests passed');
