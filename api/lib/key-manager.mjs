import { createHmac, timingSafeEqual } from 'node:crypto';

const VENICE_BASE_URL = 'https://api.venice.ai/api/v1';
const ONE_DIEM_WEI = 10n ** 18n;

export function requireAdminKey(env = process.env) {
  const key = env.VENICE_ADMIN_API_KEY;
  if (!key) throw new Error('VENICE_ADMIN_API_KEY is required');
  return key;
}

export function requireSigningSecret(env = process.env) {
  const secret = env.KEY_ENCRYPTION_SECRET || env.WSTDIEM_KEY_TOKEN_SECRET;
  if (!secret || secret.length < 16) throw new Error('KEY_ENCRYPTION_SECRET is required');
  return secret;
}

export function reserveBps(env = process.env) {
  const raw = env.WSTDIEM_RESERVE_BPS || '8000';
  const value = BigInt(raw);
  if (value < 0n || value > 10000n) throw new Error('WSTDIEM_RESERVE_BPS must be 0..10000');
  return value;
}

export function targetDiemLimitFromWei(effectiveWstDiemWei, env = process.env) {
  const wei = BigInt(effectiveWstDiemWei || '0');
  if (wei <= 0n) return '0';
  const scaled = wei * reserveBps(env);
  const whole = scaled / (ONE_DIEM_WEI * 10000n);
  let remainder = scaled % (ONE_DIEM_WEI * 10000n);
  if (remainder === 0n) return whole.toString();

  // Convert remainder/(1e18*10000) to decimal, trimming trailing zeroes.
  let fractional = remainder.toString().padStart(22, '0');
  fractional = fractional.replace(/0+$/, '');
  return `${whole}.${fractional}`;
}

function numberForVenice(decimalString) {
  const n = Number(decimalString);
  if (!Number.isFinite(n) || n < 0) throw new Error('invalid DIEM limit');
  return n;
}

export function signKeyToken({ env = process.env, payload }) {
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = createHmac('sha256', requireSigningSecret(env)).update(encodedPayload).digest('base64url');
  return `${encodedPayload}.${sig}`;
}

export function decodeKeyToken({ env = process.env, token }) {
  if (!token || !token.includes('.')) throw new Error('invalid key token');
  const [encodedPayload, sig] = token.split('.');
  const expected = createHmac('sha256', requireSigningSecret(env)).update(encodedPayload).digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
    throw new Error('invalid key token signature');
  }
  return JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
}

export async function createInferenceKey({ env = process.env, fetchImpl = fetch, address, effectiveWstDiemWei }) {
  if (!address) throw new Error('address is required');
  const targetLimitDiem = targetDiemLimitFromWei(effectiveWstDiemWei, env);
  if (targetLimitDiem === '0') throw new Error('effective wstDIEM balance is zero');

  const body = {
    apiKeyType: 'INFERENCE',
    description: `wstDIEM key for ${address}`,
    limitPeriod: 'EPOCH',
    consumptionLimit: { diem: numberForVenice(targetLimitDiem) },
  };
  const data = await veniceRequest({ env, fetchImpl, path: '/api_keys', method: 'POST', body });
  const created = data.data;
  const keyToken = signKeyToken({
    env,
    payload: {
      version: 1,
      address: address.toLowerCase(),
      veniceKeyId: created.id,
      keyLast6: created.apiKey?.slice(-6) || created.last6Chars || null,
      createdAt: new Date().toISOString(),
    },
  });

  return {
    veniceKeyId: created.id,
    apiKey: created.apiKey,
    keyLast6: created.apiKey?.slice(-6) || created.last6Chars || null,
    targetLimitDiem,
    keyToken,
  };
}

export async function getKeyStatus({ env = process.env, fetchImpl = fetch, keyToken }) {
  const decoded = decodeKeyToken({ env, token: keyToken });
  const list = await veniceRequest({ env, fetchImpl, path: '/api_keys', method: 'GET' });
  const key = (list.data || []).find((item) => item.id === decoded.veniceKeyId);
  if (!key) return { veniceKeyId: decoded.veniceKeyId, address: decoded.address, status: 'revoked' };
  const limits = key.consumptionLimits || key.consumptionLimit || {};
  const usage = key.currentPeriodUsage || { diem: '0', usd: '0' };
  return {
    veniceKeyId: key.id,
    address: decoded.address,
    keyLast6: key.last6Chars || decoded.keyLast6 || null,
    status: 'active',
    limitPeriod: key.limitPeriod,
    limitDiem: limits.diem ?? null,
    currentPeriodUsageDiem: usage.diem ?? '0',
    description: key.description,
  };
}

export async function syncInferenceKeyLimit({ env = process.env, fetchImpl = fetch, keyToken, effectiveWstDiemWei }) {
  const decoded = decodeKeyToken({ env, token: keyToken });
  const targetLimitDiem = targetDiemLimitFromWei(effectiveWstDiemWei, env);
  if (targetLimitDiem === '0') {
    await revokeInferenceKey({ env, fetchImpl, keyToken });
    return { action: 'revoked', veniceKeyId: decoded.veniceKeyId, targetLimitDiem };
  }
  const body = {
    id: decoded.veniceKeyId,
    limitPeriod: 'EPOCH',
    consumptionLimit: { diem: numberForVenice(targetLimitDiem) },
  };
  await veniceRequest({ env, fetchImpl, path: '/api_keys', method: 'PATCH', body });
  return { action: 'patched', veniceKeyId: decoded.veniceKeyId, targetLimitDiem };
}

export async function revokeInferenceKey({ env = process.env, fetchImpl = fetch, keyToken }) {
  const decoded = decodeKeyToken({ env, token: keyToken });
  await veniceRequest({ env, fetchImpl, path: `/api_keys?id=${encodeURIComponent(decoded.veniceKeyId)}`, method: 'DELETE' });
  return { success: true, veniceKeyId: decoded.veniceKeyId };
}

export async function veniceRequest({ env = process.env, fetchImpl = fetch, path, method = 'GET', body }) {
  const response = await fetchImpl(`${VENICE_BASE_URL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${requireAdminKey(env)}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!response.ok) {
    const err = new Error(`Venice API ${method} ${path} failed: ${response.status}`);
    err.status = response.status;
    err.data = data;
    throw err;
  }
  return data;
}
