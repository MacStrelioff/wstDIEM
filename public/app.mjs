import { initLiveProduct } from './live-app.mjs';
import {
  COOLDOWN_SECONDS,
  DEMO_WALLET,
  connectWallet,
  createInferenceKey,
  depositDiem,
  formatDuration,
  getActiveKeyForWallet,
  getCooldownStatus,
  getEligibleDiem,
  getKeyCreditBalance,
  initiateRedemption,
  loadState,
  resetState,
  saveState,
  shortAddress,
} from './poc-engine.mjs';

let state = saveState(loadState());
let selectedKeyId = '';

const $ = (selector) => document.querySelector(selector);
const fmt = (value, digits = 6) => Number(value || 0).toLocaleString(undefined, {
  maximumFractionDigits: digits,
});

function render() {
  const key = getActiveKeyForWallet(state);
  if (key) selectedKeyId = key.id;
  const cooldown = getCooldownStatus(state);
  const eligible = getEligibleDiem(state);
  const invariantLeft = state.vault.totalWstDiemSupply + state.wallet.pendingRedeemDiem;
  const invariantRight = state.vault.totalStakedDiem + state.vault.cooldownAmount + state.vault.liquidClaimReserve;

  $('#wallet-status').textContent = state.wallet.address
    ? `${shortAddress(state.wallet.address)} connected`
    : 'Not connected';
  $('#wallet-address').value = state.wallet.address || DEMO_WALLET;

  setText('diem-balance', `${fmt(state.wallet.diemBalance)} DIEM`);
  setText('wstdiem-balance', `${fmt(state.wallet.wstDiemBalance)} wstDIEM`);
  setText('pending-redeem', `${fmt(state.wallet.pendingRedeemDiem)} DIEM`);
  setText('vault-staked', `${fmt(state.vault.totalStakedDiem)} DIEM`);
  setText('vault-cooldown', `${fmt(state.vault.cooldownAmount)} DIEM`);
  setText('eligible-diem', `${fmt(eligible)} DIEM/day`);
  setText('cooldown-duration', formatDuration(COOLDOWN_SECONDS));
  setText('invariant', `${fmt(invariantLeft)} / ${fmt(invariantRight)} backed`);

  if (key) {
    const balance = getKeyCreditBalance(state, key.id);
    setText('key-status', 'Active');
    setText('key-id', balance.keyId);
    setText('key-wallet', shortAddress(balance.wallet));
    setText('key-limit', `${fmt(balance.diemLimit)} ${balance.creditsUnit}`);
    setText('credits-remaining', `${fmt(balance.creditsRemaining)} DIEM credits`);
    setText('key-source', balance.source);
    $('#key-card').classList.remove('muted-card');
  } else {
    setText('key-status', 'No key yet');
    setText('key-id', '—');
    setText('key-wallet', '—');
    setText('key-limit', '—');
    setText('credits-remaining', '—');
    setText('key-source', 'Mock Venice adapter');
    $('#key-card').classList.add('muted-card');
  }

  setText('cooldown-status', cooldown.status.replaceAll('_', ' '));
  setText('cooldown-batch', cooldown.batchId ? `#${cooldown.batchId}` : '—');
  setText('cooldown-amount', `${fmt(cooldown.amount)} DIEM`);
  setText('cooldown-ready', cooldown.readyAt || '—');
  setText('cooldown-remaining', cooldown.secondsRemaining ? formatDuration(cooldown.secondsRemaining) : '—');
  setText('cooldown-message', cooldown.message);

  const eventList = $('#event-log');
  eventList.innerHTML = '';
  for (const event of [...state.events].reverse().slice(0, 8)) {
    const row = document.createElement('li');
    row.innerHTML = `<span>${event.type}</span><p>${event.message || ''}</p><time>${event.at}</time>`;
    eventList.append(row);
  }

  $('#create-key').disabled = !state.wallet.address || eligible <= 0;
  $('#deposit-form button').disabled = !state.wallet.address;
  $('#redeem-form button').disabled = !state.wallet.address || state.wallet.wstDiemBalance <= 0;
}

function setText(id, value) {
  document.getElementById(id).textContent = value;
}

function setNotice(message, type = 'info') {
  const notice = $('#notice');
  notice.textContent = message;
  notice.dataset.type = type;
}

function handle(action, successMessage) {
  try {
    action();
    render();
    setNotice(successMessage, 'success');
  } catch (error) {
    render();
    setNotice(error.message, 'error');
  }
}

$('#connect-wallet').addEventListener('click', () => {
  handle(() => {
    state = connectWallet(state, $('#wallet-address').value || DEMO_WALLET);
  }, 'Wallet connected to the mock Base environment.');
});

$('#reset-demo').addEventListener('click', () => {
  state = resetState();
  selectedKeyId = '';
  render();
  setNotice('Demo state reset. Connect the wallet to restart the E2E flow.', 'info');
});

$('#deposit-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const amount = Number($('#deposit-amount').value);
  handle(() => {
    state = depositDiem(state, { amount });
  }, `Minted ${amount} wstDIEM and synced vault accounting.`);
});

$('#create-key').addEventListener('click', () => {
  handle(() => {
    state = createInferenceKey(state);
  }, 'Mock Venice inference key created for the wstDIEM holder.');
});

$('#check-key').addEventListener('click', () => {
  handle(() => {
    const key = getActiveKeyForWallet(state);
    if (!key) throw new Error('Create an inference key first.');
    selectedKeyId = key.id;
    getKeyCreditBalance(state, selectedKeyId);
  }, 'Checked mock Venice DIEM credits for the active inference key.');
});

$('#redeem-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const amount = Number($('#redeem-amount').value);
  handle(() => {
    state = initiateRedemption(state, { amount });
  }, `Initiated redemption for ${amount} DIEM and started the 24h cooldown.`);
});

initLiveProduct();
render();
