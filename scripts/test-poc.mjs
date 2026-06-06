import assert from 'node:assert/strict';
import {
  createInitialState,
  connectWallet,
  depositDiem,
  createInferenceKey,
  getKeyCreditBalance,
  initiateRedemption,
  getCooldownStatus,
  DEMO_WALLET,
} from '../public/poc-engine.mjs';

const now = Date.parse('2026-06-07T04:00:00.000Z');

let state = createInitialState({ now });
state = connectWallet(state, DEMO_WALLET);
assert.equal(state.wallet.address, DEMO_WALLET);
assert.equal(state.wallet.diemBalance, 25);
assert.equal(state.wallet.wstDiemBalance, 0);

state = depositDiem(state, { amount: 12.5, now });
assert.equal(state.wallet.diemBalance, 12.5);
assert.equal(state.wallet.wstDiemBalance, 12.5);
assert.equal(state.vault.totalStakedDiem, 12.5);
assert.equal(state.vault.totalWstDiemSupply, 12.5);
assert.equal(state.events.at(-1).type, 'wstDIEM_MINTED');

state = createInferenceKey(state, { now: now + 1000 });
assert.equal(state.venice.keys.length, 1);
assert.equal(state.venice.keys[0].wallet, DEMO_WALLET);
assert.equal(state.venice.keys[0].status, 'active');
assert.equal(state.venice.keys[0].diemLimit, 12.5);
assert.equal(state.venice.keys[0].creditsRemaining, 12.5);
assert.match(state.venice.keys[0].id, /^vk_demo_/);

let balance = getKeyCreditBalance(state, state.venice.keys[0].id);
assert.deepEqual(balance, {
  keyId: state.venice.keys[0].id,
  wallet: DEMO_WALLET,
  limitPeriod: 'EPOCH',
  diemLimit: 12.5,
  creditsRemaining: 12.5,
  creditsUnit: 'DIEM/day',
  source: 'Mock Venice adapter',
});

state = initiateRedemption(state, { amount: 4.25, now: now + 2000 });
assert.equal(state.wallet.wstDiemBalance, 8.25);
assert.equal(state.wallet.pendingRedeemDiem, 4.25);
assert.equal(state.vault.activeBatch.amount, 4.25);
assert.equal(state.vault.totalStakedDiem, 8.25);
assert.equal(state.vault.cooldownAmount, 4.25);
assert.equal(state.venice.keys[0].diemLimit, 8.25);
assert.equal(state.venice.keys[0].creditsRemaining, 8.25);

const cooldown = getCooldownStatus(state, { now: now + 3600 * 1000 });
assert.equal(cooldown.status, 'COOLING_DOWN');
assert.equal(cooldown.amount, 4.25);
assert.equal(cooldown.readyAt, new Date(now + 2000 + 24 * 3600 * 1000).toISOString());
assert.equal(cooldown.secondsRemaining, 23 * 3600 + 2);

const invariant = state.vault.totalWstDiemSupply + state.wallet.pendingRedeemDiem;
const backing = state.vault.totalStakedDiem + state.vault.cooldownAmount + state.vault.liquidClaimReserve;
assert.equal(invariant, backing);

console.log('POC E2E test passed: mint -> key -> credits -> redeem cooldown');
