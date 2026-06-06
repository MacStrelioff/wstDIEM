import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
const config = readFileSync(new URL('../public/live-config.mjs', import.meta.url), 'utf8');

const requiredCopy = [
  'Use DIEM for Venice compute',
  'Connect wallet',
  'Deposit DIEM to mint wstDIEM',
  'Get your Venice inference API key',
  'Remaining DIEM on key',
  'wstDIEM balance',
  'Redeem wstDIEM back to DIEM',
  'Complete unstake after cooldown',
  'Claim DIEM',
  'Contracts, operator, and proof',
];

for (const copy of requiredCopy) {
  assert.ok(html.includes(copy), `missing product copy: ${copy}`);
}

const forbiddenPrimaryCopy = [
  'No contract deployed',
  'Not deployed yet',
  'Venice key integration gated',
  'wstDIEM POC',
  'POC event log',
  'Developer simulator',
];

for (const copy of forbiddenPrimaryCopy) {
  assert.ok(!html.includes(copy), `old/prototype copy still visible: ${copy}`);
}

const requiredIds = [
  'live-connect',
  'live-refresh',
  'live-approve-form',
  'live-deposit-form',
  'product-connect',
  'product-key-create',
  'product-key-sync',
  'product-key-copy',
  'product-key-revoke',
  'product-key-wst-balance',
  'product-key-remaining',
  'product-key-value',
  'live-redeem-form',
  'live-complete-unstake',
  'live-claim-form',
  'live-claim-batch-id',
  'product-operator',
  'live-vault-address',
  'live-wst-address',
  'live-diem-address',
];

for (const id of requiredIds) {
  assert.ok(html.includes(`id="${id}"`), `missing element id: ${id}`);
}

assert.ok(html.includes('/product-app.mjs'), 'product key app module not loaded');
assert.ok(html.includes('/app.mjs'), 'live app module not loaded');
assert.ok(config.includes('operator'), 'live config exposes operator address');
assert.ok(config.includes('vault'), 'live config exposes vault address');
assert.ok(config.includes('wstDiem'), 'live config exposes wstDIEM address');

console.log('product dashboard smoke test passed');
