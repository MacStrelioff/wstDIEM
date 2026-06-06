import { LIVE_CONFIG } from './live-config.mjs';

const SELECTORS = {
  approve: '0x095ea7b3',
  transfer: '0xa9059cbb',
  balanceOf: '0x70a08231',
  deposit: '0xb6b55f25',
  requestRedeem: '0xaa2f892d',
  proofOfReserves: '0xa74b7d83',
};

const state = {
  wallet: null,
  keyToken: localStorage.getItem('wstdiem:keyToken') || '',
  apiKey: localStorage.getItem('wstdiem:apiKey') || '',
};

const $ = (id) => document.getElementById(id);
const set = (id, text) => { const el = $(id); if (el) el.textContent = text; };

function encodeUint(value) { return BigInt(value).toString(16).padStart(64, '0'); }
function encodeAddress(address) { return address.toLowerCase().replace(/^0x/, '').padStart(64, '0'); }
function parseUnits(value) {
  const [whole, frac = ''] = String(value).trim().split('.');
  return BigInt(whole || '0') * 10n ** 18n + BigInt((frac + '0'.repeat(18)).slice(0, 18));
}
function formatUnits(wei) {
  const value = BigInt(wei || 0);
  const whole = value / 10n ** 18n;
  const frac = (value % (10n ** 18n)).toString().padStart(18, '0').replace(/0+$/, '');
  return frac ? `${whole}.${frac}` : whole.toString();
}

async function request(method, params) {
  if (!window.ethereum) throw new Error('Wallet not available');
  return window.ethereum.request({ method, params });
}

async function ethCall(to, data) {
  return request('eth_call', [{ to, data }, 'latest']);
}

async function sendTx(to, data) {
  if (!state.wallet) throw new Error('Connect wallet first');
  const [hash] = await request('eth_sendTransaction', [{ from: state.wallet, to, data }]);
  return hash;
}

function requireV1() {
  if (!LIVE_CONFIG.v1Vault || !LIVE_CONFIG.v1WstDiem) {
    throw new Error('Key-dashboard balance-source contracts are not configured yet.');
  }
}

async function connect() {
  const accounts = await request('eth_requestAccounts', []);
  state.wallet = accounts[0];
  set('product-wallet', state.wallet);
  await refresh();
}

async function refresh() {
  set('product-operator', LIVE_CONFIG.operator || '—');
  set('product-vault', LIVE_CONFIG.v1Vault || 'Prototype config not active');
  set('product-token', LIVE_CONFIG.v1WstDiem || 'Prototype config not active');
  await refreshKeyStatus();
  if (!LIVE_CONFIG.v1Vault || !LIVE_CONFIG.v1WstDiem) {
    set('product-por-solvent', 'Pending key-dashboard balance-source config');
    set('product-por-liabilities', '—');
    set('product-por-backing', '—');
    set('product-por-operator-stake', '—');
    set('product-por-vault-liquid', '—');
    return;
  }
  const proof = await ethCall(LIVE_CONFIG.v1Vault, SELECTORS.proofOfReserves);
  renderProof(proof);
}

function renderProof(hexResult) {
  const raw = hexResult.replace(/^0x/, '').padStart(9 * 64, '0');
  const words = Array.from({ length: 9 }, (_, i) => BigInt(`0x${raw.slice(i * 64, (i + 1) * 64)}`));
  set('product-por-solvent', words[8] === 1n ? 'true' : 'false');
  set('product-por-liabilities', `${formatUnits(words[7])} DIEM`);
  set('product-por-backing', `${formatUnits(words[6])} DIEM`);
  set('product-por-operator-stake', `${formatUnits(words[2])} DIEM`);
  set('product-por-vault-liquid', `${formatUnits(words[5])} DIEM`);
}

async function deposit(event) {
  event.preventDefault();
  requireV1();
  const amount = parseUnits($('product-deposit-amount').value);
  await sendTx(LIVE_CONFIG.diem, SELECTORS.approve + encodeAddress(LIVE_CONFIG.v1Vault) + encodeUint(amount));
  const hash = await sendTx(LIVE_CONFIG.v1Vault, SELECTORS.deposit + encodeUint(amount));
  notice(`Deposit submitted: ${hash}`);
  await refresh();
}

async function transfer(event) {
  event.preventDefault();
  requireV1();
  const to = $('product-transfer-to').value.trim();
  const amount = parseUnits($('product-transfer-amount').value);
  const hash = await sendTx(LIVE_CONFIG.v1WstDiem, SELECTORS.transfer + encodeAddress(to) + encodeUint(amount));
  notice(`Transfer submitted: ${hash}. Syncing key limit...`);
  await syncKey();
}

async function redeem(event) {
  event.preventDefault();
  requireV1();
  const amount = parseUnits($('product-redeem-amount').value);
  const hash = await sendTx(LIVE_CONFIG.v1Vault, SELECTORS.requestRedeem + encodeUint(amount));
  notice(`Redeem request submitted: ${hash}. Syncing key limit...`);
  await syncKey();
  await refresh();
}

async function effectiveWstDiemWei() {
  if (!state.wallet || !LIVE_CONFIG.v1WstDiem) return '0';
  const result = await ethCall(LIVE_CONFIG.v1WstDiem, SELECTORS.balanceOf + encodeAddress(state.wallet));
  return BigInt(result).toString();
}

async function createKey() {
  if (!state.wallet) throw new Error('Connect wallet first');
  const body = { address: state.wallet };
  if (!LIVE_CONFIG.v1WstDiem) body.effectiveWstDiemWei = '1000000000000000'; // preview-only until deploy; server ignores unless explicitly allowed.
  const result = await api('/api/key/create', body);
  state.keyToken = result.keyToken;
  state.apiKey = result.apiKey;
  localStorage.setItem('wstdiem:keyToken', state.keyToken);
  localStorage.setItem('wstdiem:apiKey', state.apiKey);
  renderKey(result, 'active');
  notice('Venice inference key created. Copy and use it directly with Venice.');
}

async function refreshKeyStatus() {
  if (!state.keyToken) {
    set('product-key-status', 'No key');
    return;
  }
  try {
    const result = await api('/api/key/status', { keyToken: state.keyToken });
    renderKey(result, result.status);
  } catch (err) {
    set('product-key-status', `status error: ${err.message}`);
  }
}

async function syncKey() {
  if (!state.keyToken) throw new Error('No key token in this browser');
  const body = { keyToken: state.keyToken };
  if (!LIVE_CONFIG.v1WstDiem) body.effectiveWstDiemWei = '0';
  const result = await api('/api/key/sync', body);
  set('product-key-status', result.action);
  set('product-key-limit', `${result.targetLimitDiem} DIEM / epoch`);
  if (result.action === 'revoked') {
    state.keyToken = '';
    state.apiKey = '';
    localStorage.removeItem('wstdiem:keyToken');
    localStorage.removeItem('wstdiem:apiKey');
  }
  notice(`Key ${result.action}.`);
}

async function revokeKey() {
  if (!state.keyToken) throw new Error('No key token in this browser');
  await api('/api/key/revoke', { keyToken: state.keyToken });
  state.keyToken = '';
  state.apiKey = '';
  localStorage.removeItem('wstdiem:keyToken');
  localStorage.removeItem('wstdiem:apiKey');
  renderKey({}, 'revoked');
  notice('Venice inference key revoked.');
}

async function copyKey() {
  if (!state.apiKey) throw new Error('API key is only available in this browser after create/rotate.');
  await navigator.clipboard.writeText(state.apiKey);
  notice('Copied Venice inference key.');
}

async function smokeVenice() {
  if (!state.apiKey) throw new Error('Create/copy a Venice key first.');
  const response = await fetch('https://api.venice.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${state.apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'venice-uncensored-1-2', messages: [{ role: 'user', content: 'Say only OK.' }], max_tokens: 16, temperature: 0 }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data?.error || `Venice ${response.status}`);
  notice(`Venice direct response: ${data.choices?.[0]?.message?.content || '(empty)'}`);
}

async function api(path, body) {
  const response = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `API ${response.status}`);
  return data;
}

function renderKey(result, status) {
  set('product-key-status', status || result.status || '—');
  set('product-key-limit', result.targetLimitDiem ? `${result.targetLimitDiem} DIEM / epoch` : result.limitDiem != null ? `${result.limitDiem} DIEM / epoch` : '—');
  set('product-key-id', result.veniceKeyId || '—');
  set('product-key-last6', result.keyLast6 || '—');
}

function notice(message) { set('product-notice', message); }
function bind(id, event, fn) {
  const el = $(id);
  if (el) el.addEventListener(event, (ev) => fn(ev).catch((err) => notice(err.message)));
}

bind('product-connect', 'click', connect);
bind('product-refresh', 'click', refresh);
bind('product-deposit-form', 'submit', deposit);
bind('product-transfer-form', 'submit', transfer);
bind('product-redeem-form', 'submit', redeem);
bind('product-key-create', 'click', createKey);
bind('product-key-sync', 'click', syncKey);
bind('product-key-revoke', 'click', revokeKey);
bind('product-key-copy', 'click', copyKey);
bind('product-venice-smoke', 'click', smokeVenice);
refresh().catch(() => {});
