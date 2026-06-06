export const DEMO_WALLET = '0x23bB05603A980C2915FC3B9D5D4a475993b666DE';
export const DIEM_CONTRACT = '0xf4d97f2da56e8c3098f3a8d538db630a2606a024';
export const COOLDOWN_SECONDS = 24 * 60 * 60;

const round = (value) => Math.round((Number(value) + Number.EPSILON) * 1_000_000) / 1_000_000;
const iso = (value) => new Date(value).toISOString();
const clone = (value) => JSON.parse(JSON.stringify(value));

export function createInitialState({ now = Date.now() } = {}) {
  return {
    mode: 'mock-e2e',
    chain: {
      id: 8453,
      name: 'Base',
      diemContract: DIEM_CONTRACT,
      cooldownSeconds: COOLDOWN_SECONDS,
    },
    wallet: {
      address: '',
      diemBalance: 25,
      wstDiemBalance: 0,
      pendingRedeemDiem: 0,
    },
    vault: {
      address: '0xVault000000000000000000000000000000wstDIEM',
      totalStakedDiem: 0,
      totalWstDiemSupply: 0,
      cooldownAmount: 0,
      liquidClaimReserve: 0,
      nextBatchId: 1,
      activeBatch: null,
      batches: [],
    },
    venice: {
      adapter: 'Mock Venice adapter',
      adminKeyStatus: 'mocked',
      keys: [],
    },
    events: [
      {
        type: 'POC_READY',
        at: iso(now),
        message: 'Mock DIEM vault and Mock Venice adapter initialized.',
      },
    ],
  };
}

export function loadState() {
  if (typeof localStorage === 'undefined') return createInitialState();
  const raw = localStorage.getItem('wstdiem:poc-state');
  if (!raw) return createInitialState();
  try {
    return JSON.parse(raw);
  } catch {
    return createInitialState();
  }
}

export function saveState(state) {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('wstdiem:poc-state', JSON.stringify(state));
  }
  return state;
}

export function resetState({ now = Date.now() } = {}) {
  const state = createInitialState({ now });
  return saveState(state);
}

export function connectWallet(state, address = DEMO_WALLET, { now = Date.now() } = {}) {
  const next = clone(state);
  next.wallet.address = address || DEMO_WALLET;
  next.events.push({
    type: 'WALLET_CONNECTED',
    at: iso(now),
    wallet: next.wallet.address,
    message: `Connected ${shortAddress(next.wallet.address)} to Base mock state.`,
  });
  return saveState(next);
}

export function depositDiem(state, { amount, now = Date.now() }) {
  const value = normalizePositiveAmount(amount, 'deposit amount');
  const next = clone(state);
  requireWallet(next);
  if (value > next.wallet.diemBalance) {
    throw new Error(`Insufficient DIEM. Available: ${next.wallet.diemBalance}`);
  }

  next.wallet.diemBalance = round(next.wallet.diemBalance - value);
  next.wallet.wstDiemBalance = round(next.wallet.wstDiemBalance + value);
  next.vault.totalStakedDiem = round(next.vault.totalStakedDiem + value);
  next.vault.totalWstDiemSupply = round(next.vault.totalWstDiemSupply + value);
  next.events.push({
    type: 'wstDIEM_MINTED',
    at: iso(now),
    wallet: next.wallet.address,
    amount: value,
    message: `Deposited ${value} DIEM, staked it through the vault, and minted ${value} wstDIEM.`,
  });
  syncActiveKeyLimit(next, now);
  assertAccountingInvariant(next);
  return saveState(next);
}

export function createInferenceKey(state, { now = Date.now() } = {}) {
  const next = clone(state);
  requireWallet(next);
  const eligible = getEligibleDiem(next);
  if (eligible <= 0) throw new Error('Mint wstDIEM before creating an inference key.');

  const existing = next.venice.keys.find((key) => key.wallet === next.wallet.address && key.status === 'active');
  if (existing) {
    existing.diemLimit = eligible;
    existing.creditsRemaining = eligible;
    existing.updatedAt = iso(now);
    next.events.push({
      type: 'VENICE_KEY_SYNCED',
      at: iso(now),
      keyId: existing.id,
      amount: eligible,
      message: `Synced existing inference key to ${eligible} DIEM/day.`,
    });
    return saveState(next);
  }

  const id = `vk_demo_${next.wallet.address.slice(2, 8).toLowerCase()}_${String(next.venice.keys.length + 1).padStart(2, '0')}`;
  const key = {
    id,
    wallet: next.wallet.address,
    status: 'active',
    keyPreview: `venice_demo_${next.wallet.address.slice(2, 6)}…${id.slice(-5)}`,
    limitPeriod: 'EPOCH',
    diemLimit: eligible,
    creditsRemaining: eligible,
    creditsUnit: 'DIEM/day',
    source: next.venice.adapter,
    createdAt: iso(now),
    updatedAt: iso(now),
  };
  next.venice.keys.push(key);
  next.events.push({
    type: 'VENICE_KEY_CREATED',
    at: iso(now),
    keyId: id,
    wallet: next.wallet.address,
    amount: eligible,
    message: `Created mock Venice inference key with ${eligible} DIEM/day EPOCH limit.`,
  });
  return saveState(next);
}

export function getKeyCreditBalance(state, keyId) {
  const key = state.venice.keys.find((candidate) => candidate.id === keyId);
  if (!key) throw new Error(`No inference key found for ${keyId}`);
  return {
    keyId: key.id,
    wallet: key.wallet,
    limitPeriod: key.limitPeriod,
    diemLimit: key.diemLimit,
    creditsRemaining: key.creditsRemaining,
    creditsUnit: key.creditsUnit,
    source: key.source,
  };
}

export function initiateRedemption(state, { amount, now = Date.now() }) {
  const value = normalizePositiveAmount(amount, 'redemption amount');
  const next = clone(state);
  requireWallet(next);
  if (value > next.wallet.wstDiemBalance) {
    throw new Error(`Insufficient wstDIEM. Available: ${next.wallet.wstDiemBalance}`);
  }

  const requestedAt = Number(now);
  const readyAt = requestedAt + COOLDOWN_SECONDS * 1000;
  const batch = {
    id: next.vault.nextBatchId,
    status: 'COOLING_DOWN',
    amount: value,
    wallet: next.wallet.address,
    requestedAt: iso(requestedAt),
    readyAt: iso(readyAt),
    cooldownSeconds: COOLDOWN_SECONDS,
  };

  next.vault.nextBatchId += 1;
  next.vault.activeBatch = batch;
  next.vault.batches.push(batch);
  next.wallet.wstDiemBalance = round(next.wallet.wstDiemBalance - value);
  next.wallet.pendingRedeemDiem = round(next.wallet.pendingRedeemDiem + value);
  next.vault.totalWstDiemSupply = round(next.vault.totalWstDiemSupply - value);
  next.vault.totalStakedDiem = round(next.vault.totalStakedDiem - value);
  next.vault.cooldownAmount = round(next.vault.cooldownAmount + value);
  next.events.push({
    type: 'REDEMPTION_INITIATED',
    at: iso(requestedAt),
    batchId: batch.id,
    amount: value,
    readyAt: batch.readyAt,
    message: `Burned/locked ${value} wstDIEM and initiated a 24h DIEM cooldown batch.`,
  });
  syncActiveKeyLimit(next, now);
  assertAccountingInvariant(next);
  return saveState(next);
}

export function getCooldownStatus(state, { now = Date.now() } = {}) {
  const batch = state.vault.activeBatch;
  if (!batch) {
    return {
      status: 'NO_ACTIVE_COOLDOWN',
      amount: 0,
      readyAt: null,
      secondsRemaining: 0,
      message: 'No redemption batch is cooling down.',
    };
  }
  const remaining = Math.max(0, Math.ceil((Date.parse(batch.readyAt) - Number(now)) / 1000));
  return {
    batchId: batch.id,
    status: remaining === 0 ? 'READY_TO_COMPLETE' : 'COOLING_DOWN',
    amount: batch.amount,
    requestedAt: batch.requestedAt,
    readyAt: batch.readyAt,
    secondsRemaining: remaining,
    message:
      remaining === 0
        ? 'Cooldown is complete. The vault can call unstake().'
        : `${formatDuration(remaining)} remaining before DIEM can be claimed.`,
  };
}

export function getActiveKeyForWallet(state) {
  return state.venice.keys.find((key) => key.wallet === state.wallet.address && key.status === 'active') || null;
}

export function getEligibleDiem(state) {
  return round(state.wallet.wstDiemBalance);
}

export function assertAccountingInvariant(state) {
  const left = round(state.vault.totalWstDiemSupply + state.wallet.pendingRedeemDiem);
  const right = round(state.vault.totalStakedDiem + state.vault.cooldownAmount + state.vault.liquidClaimReserve);
  if (left !== right) {
    throw new Error(`Vault accounting invariant failed: ${left} != ${right}`);
  }
  return true;
}

export function shortAddress(address) {
  if (!address) return 'not connected';
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function formatDuration(totalSeconds) {
  const seconds = Math.max(0, Number(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (hours > 0) return `${hours}h ${minutes}m ${secs}s`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}

function syncActiveKeyLimit(state, now) {
  const key = getActiveKeyForWallet(state);
  if (!key) return;
  const eligible = getEligibleDiem(state);
  key.diemLimit = eligible;
  key.creditsRemaining = Math.min(key.creditsRemaining, eligible);
  key.updatedAt = iso(now);
  state.events.push({
    type: 'VENICE_KEY_LIMIT_UPDATED',
    at: iso(now),
    keyId: key.id,
    amount: eligible,
    message: `Updated mock Venice key limit to ${eligible} DIEM/day based on active wstDIEM.`,
  });
}

function requireWallet(state) {
  if (!state.wallet.address) throw new Error('Connect a wallet first.');
}

function normalizePositiveAmount(amount, label) {
  const value = round(amount);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`Invalid ${label}.`);
  return value;
}
