import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LIVE_CONFIG } from '../public/live-config.mjs';

const deployment = JSON.parse(readFileSync(new URL('../deployments/base-mainnet.json', import.meta.url)));

assert.equal(LIVE_CONFIG.chainId, deployment.chainId);
assert.equal(LIVE_CONFIG.diem.toLowerCase(), deployment.diem.toLowerCase());
assert.equal(LIVE_CONFIG.vault.toLowerCase(), deployment.wstDiemVault.toLowerCase());
assert.equal(LIVE_CONFIG.wstDiem.toLowerCase(), deployment.wstDiem.toLowerCase());
assert.equal(LIVE_CONFIG.e2e.deployTx, deployment.deployTx);
assert.equal(LIVE_CONFIG.e2e.approveTx, deployment.e2e.approveTx);
assert.equal(LIVE_CONFIG.e2e.depositStakeMintTx, deployment.e2e.depositStakeMintTx);
assert.equal(LIVE_CONFIG.e2e.redeemInitiationTx, deployment.e2e.redeemInitiationTx);
assert.equal(LIVE_CONFIG.e2e.readyAtUtc, deployment.e2e.readyAtUtc);

for (const [name, value] of Object.entries({
  diem: LIVE_CONFIG.diem,
  vault: LIVE_CONFIG.vault,
  wstDiem: LIVE_CONFIG.wstDiem,
  deployTx: LIVE_CONFIG.e2e.deployTx,
  approveTx: LIVE_CONFIG.e2e.approveTx,
  depositStakeMintTx: LIVE_CONFIG.e2e.depositStakeMintTx,
  redeemInitiationTx: LIVE_CONFIG.e2e.redeemInitiationTx,
})) {
  assert.match(value, /^0x[a-fA-F0-9]+$/, `${name} must be hex`);
}

console.log('Live config matches deployment metadata');
