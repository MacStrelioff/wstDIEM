import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const config = readFileSync(new URL('../public/live-config.mjs', import.meta.url), 'utf8');

const requiredCopy = [
  'Live wstDIEM Product',
  'Transferable wstDIEM',
  'Venice inference key',
  'Proof of reserves',
  'Admin key remains server-only',
  'User calls Venice directly',
];

for (const copy of requiredCopy) {
  assert.ok(html.includes(copy), `missing product copy: ${copy}`);
}

const requiredIds = [
  'product-connect',
  'product-refresh',
  'product-deposit-form',
  'product-transfer-form',
  'product-redeem-form',
  'product-key-create',
  'product-key-sync',
  'product-key-revoke',
  'product-key-copy',
  'product-venice-smoke',
  'product-por-solvent',
  'product-por-liabilities',
  'product-por-backing',
  'product-key-limit',
  'product-key-status',
];

for (const id of requiredIds) {
  assert.ok(html.includes(`id="${id}"`), `missing element id: ${id}`);
}

assert.ok(html.includes('/product-app.mjs'), 'product app module not loaded');
assert.ok(config.includes('operator'), 'live config exposes operator address');
assert.ok(config.includes('v1Vault'), 'live config exposes V1 vault slot');
assert.ok(config.includes('v1WstDiem'), 'live config exposes V1 wstDIEM slot');

console.log('product dashboard smoke test passed');
