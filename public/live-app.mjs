import { LIVE_CONFIG } from './live-config.mjs';

const SELECTORS = {
  approve: '0x095ea7b3',
  deposit: '0xb6b55f25',
  requestRedeem: '0xaa2f892d',
  balanceOf: '0x70a08231',
  allowance: '0xdd62ed3e',
  totalSupply: '0x18160ddd',
  totalActiveStake: '0x28f73148',
  totalPendingRedeemPrincipal: '0x4febe147',
  totalCooldownPrincipal: '0x12440a57',
  totalLiquidClaimReserve: '0xd4626712',
  activeCooldownStatus: '0xc6ecba8d',
  accountingInvariantHolds: '0xb6ad264f',
  pendingRedeemPrincipal: '0x849d8712',
  completeUnstakeBatch: '0x39d7e714',
  claimRedeemed: '0x7dbddaae',
  stakedInfos: '0x9503b15c',
};

let account = '';
let activeBatchId = 0n;

const $ = (id) => document.getElementById(id);
const set = (id, value) => { const el = $(id); if (el) el.textContent = value; };
const explorerAddress = (address) => `${LIVE_CONFIG.blockExplorer}/address/${address}`;
const explorerTx = (tx) => `${LIVE_CONFIG.blockExplorer}/tx/${tx}`;

export function initLiveProduct() {
  renderStaticLinks();
  $('live-connect')?.addEventListener('click', connectWallet);
  $('live-refresh')?.addEventListener('click', refreshLiveState);
  $('live-approve-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    await sendAmountTx('approve', LIVE_CONFIG.diem, SELECTORS.approve + encodeAddress(LIVE_CONFIG.vault) + encodeUint(parseDiem($('live-approve-amount').value)), 'DIEM approval submitted.');
  });
  $('live-deposit-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    await sendAmountTx('deposit', LIVE_CONFIG.vault, SELECTORS.deposit + encodeUint(parseDiem($('live-deposit-amount').value)), 'Deposit/stake/mint transaction submitted.');
  });
  $('live-redeem-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    await sendAmountTx('requestRedeem', LIVE_CONFIG.vault, SELECTORS.requestRedeem + encodeUint(parseDiem($('live-redeem-amount').value)), 'Redemption started. Wait for the cooldown, then complete unstake and claim DIEM.');
  });
  $('live-complete-unstake')?.addEventListener('click', async () => {
    const batchId = getBatchIdForAction();
    await sendSimpleTx('completeUnstakeBatch', LIVE_CONFIG.vault, SELECTORS.completeUnstakeBatch + encodeUint(batchId), 'Unstake completion submitted. After it confirms, claim DIEM for the same batch.');
  });
  $('live-claim-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const batchId = parseBatchId($('live-claim-batch-id')?.value || activeBatchId || '0');
    await sendSimpleTx('claimRedeemed', LIVE_CONFIG.vault, SELECTORS.claimRedeemed + encodeUint(batchId), 'DIEM claim submitted.');
  });
  refreshLiveState().catch((error) => setLiveNotice(error.message, 'error'));
}

async function connectWallet() {
  if (!window.ethereum) {
    setLiveNotice('No injected wallet found. Install a wallet that supports Base, then refresh.', 'error');
    return;
  }
  const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
  account = accounts[0] || '';
  await ensureBase();
  set('live-wallet', account ? shortAddress(account) : 'Not connected');
  setLiveNotice('Wallet connected. Live contract reads refreshed.', 'success');
  await refreshLiveState();
}

async function ensureBase() {
  const current = await window.ethereum.request({ method: 'eth_chainId' });
  if (current === LIVE_CONFIG.chainHex) return;
  try {
    await window.ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: LIVE_CONFIG.chainHex }] });
  } catch (error) {
    if (error.code !== 4902) throw error;
    await window.ethereum.request({
      method: 'wallet_addEthereumChain',
      params: [{
        chainId: LIVE_CONFIG.chainHex,
        chainName: 'Base',
        nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
        rpcUrls: LIVE_CONFIG.rpcUrls,
        blockExplorerUrls: [LIVE_CONFIG.blockExplorer],
      }],
    });
  }
}

async function refreshLiveState() {
  const reader = { request: rpcRequest };
  if (window.ethereum && !account) {
    try {
      const accounts = await window.ethereum.request({ method: 'eth_accounts' });
      account = accounts[0] || '';
    } catch {
      account = '';
    }
  }
  set('live-wallet', account ? shortAddress(account) : 'Not connected');

  const wallet = account || LIVE_CONFIG.deployer;
  const [diemBal, wstBal, wstSupply, allowance, activeStake, totalPending, totalCooldown, liquidReserve, invariant, activeStatus, stakedInfo] = await Promise.all([
    ethCall(reader, LIVE_CONFIG.diem, SELECTORS.balanceOf + encodeAddress(wallet)),
    ethCall(reader, LIVE_CONFIG.wstDiem, SELECTORS.balanceOf + encodeAddress(wallet)),
    ethCall(reader, LIVE_CONFIG.wstDiem, SELECTORS.totalSupply),
    ethCall(reader, LIVE_CONFIG.diem, SELECTORS.allowance + encodeAddress(wallet) + encodeAddress(LIVE_CONFIG.vault)),
    ethCall(reader, LIVE_CONFIG.vault, SELECTORS.totalActiveStake),
    ethCall(reader, LIVE_CONFIG.vault, SELECTORS.totalPendingRedeemPrincipal),
    ethCall(reader, LIVE_CONFIG.vault, SELECTORS.totalCooldownPrincipal),
    ethCall(reader, LIVE_CONFIG.vault, SELECTORS.totalLiquidClaimReserve),
    ethCall(reader, LIVE_CONFIG.vault, SELECTORS.accountingInvariantHolds),
    ethCall(reader, LIVE_CONFIG.vault, SELECTORS.activeCooldownStatus),
    ethCall(reader, LIVE_CONFIG.diem, SELECTORS.stakedInfos + encodeAddress(LIVE_CONFIG.vault)),
  ]);

  if (account) {
    set('live-diem-balance', `${formatDiem(readUint(diemBal, 0))} DIEM`);
    set('live-wst-balance', `${formatDiem(readUint(wstBal, 0))} wstDIEM`);
    set('live-allowance', `${formatDiem(readUint(allowance, 0))} DIEM`);
  } else {
    set('live-diem-balance', 'Connect wallet');
    set('live-wst-balance', 'Connect wallet');
    set('live-allowance', 'Connect wallet');
  }
  set('live-wst-supply', `${formatDiem(readUint(wstSupply, 0))} wstDIEM`);
  set('live-active-stake', `${formatDiem(readUint(activeStake, 0))} DIEM`);
  set('live-total-pending', `${formatDiem(readUint(totalPending, 0))} DIEM`);
  set('live-total-cooldown', `${formatDiem(readUint(totalCooldown, 0))} DIEM`);
  set('live-liquid-reserve', `${formatDiem(readUint(liquidReserve, 0))} DIEM`);
  set('live-invariant', readBool(invariant) ? 'true' : 'false');

  activeBatchId = readUint(activeStatus, 0);
  const batchAmount = readUint(activeStatus, 1);
  const readyAt = readUint(activeStatus, 2);
  set('live-batch-id', activeBatchId ? `#${activeBatchId}` : '—');
  set('live-batch-amount', `${formatDiem(batchAmount)} DIEM`);
  set('live-ready-at', readyAt ? new Date(Number(readyAt) * 1000).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—');
  const claimInput = $('live-claim-batch-id');
  if (claimInput && activeBatchId) claimInput.value = activeBatchId.toString();

  set('live-diem-staked', `${formatDiem(readUint(stakedInfo, 0))} DIEM`);
  set('live-diem-cooldown-end', readUint(stakedInfo, 1) ? new Date(Number(readUint(stakedInfo, 1)) * 1000).toISOString() : '—');
  set('live-diem-cooldown-amount', `${formatDiem(readUint(stakedInfo, 2))} DIEM`);
}

async function sendAmountTx(label, to, data, successMessage) {
  await sendSimpleTx(label, to, data, successMessage);
}

async function sendSimpleTx(label, to, data, successMessage) {
  if (!window.ethereum) throw new Error('No injected wallet available for live transactions.');
  await ensureBase();
  if (!account) await connectWallet();
  const tx = await window.ethereum.request({ method: 'eth_sendTransaction', params: [{ from: account, to, data }] });
  addLiveTx(label, tx);
  setLiveNotice(`${successMessage} ${tx}`, 'success');
  await refreshLiveState().catch(() => {});
}

async function ethCall(reader, to, data) {
  return reader.request({ method: 'eth_call', params: [{ to, data }, 'latest'] });
}

async function rpcRequest({ method, params }) {
  let lastError = null;
  for (const rpcUrl of LIVE_CONFIG.rpcUrls) {
    try {
      const response = await fetch(rpcUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      });
      const payload = await response.json();
      if (payload.error) throw new Error(payload.error.message || 'RPC request failed');
      return payload.result;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('All public Base RPC endpoints failed');
}

function renderStaticLinks() {
  set('live-vault-address', LIVE_CONFIG.vault);
  set('live-wst-address', LIVE_CONFIG.wstDiem);
  set('live-diem-address', LIVE_CONFIG.diem);
  set('live-deploy-tx', LIVE_CONFIG.e2e.deployTx);
  set('live-approve-tx', LIVE_CONFIG.e2e.approveTx);
  set('live-deposit-tx', LIVE_CONFIG.e2e.depositStakeMintTx);
  set('live-redeem-tx', LIVE_CONFIG.e2e.redeemInitiationTx);
  for (const [id, href] of Object.entries({
    'live-vault-link': explorerAddress(LIVE_CONFIG.vault),
    'live-wst-link': explorerAddress(LIVE_CONFIG.wstDiem),
    'live-diem-link': explorerAddress(LIVE_CONFIG.diem),
    'live-deploy-link': explorerTx(LIVE_CONFIG.e2e.deployTx),
    'live-approve-link': explorerTx(LIVE_CONFIG.e2e.approveTx),
    'live-deposit-link': explorerTx(LIVE_CONFIG.e2e.depositStakeMintTx),
    'live-redeem-link': explorerTx(LIVE_CONFIG.e2e.redeemInitiationTx),
  })) {
    const el = $(id);
    if (el) el.href = href;
  }
}

function addLiveTx(label, tx) {
  const list = $('live-submitted-txs');
  if (!list) return;
  const item = document.createElement('li');
  item.innerHTML = `<span>${label}</span><a href="${explorerTx(tx)}" target="_blank" rel="noreferrer">${tx}</a>`;
  list.prepend(item);
}

function setLiveNotice(message, type = 'info') {
  const el = $('live-notice');
  if (!el) return;
  el.textContent = message;
  el.dataset.type = type;
}

function encodeAddress(address) {
  return address.toLowerCase().replace(/^0x/, '').padStart(64, '0');
}

function encodeUint(value) {
  return BigInt(value).toString(16).padStart(64, '0');
}

function parseDiem(value) {
  const [wholeRaw, fracRaw = ''] = String(value || '0').trim().split('.');
  const whole = BigInt(wholeRaw || '0') * 10n ** 18n;
  const frac = BigInt((fracRaw + '0'.repeat(18)).slice(0, 18));
  return whole + frac;
}

function parseBatchId(value) {
  const normalized = String(value || '').replace(/^#/, '').trim();
  const batchId = BigInt(normalized || '0');
  if (batchId <= 0n) throw new Error('Enter a redemption batch number.');
  return batchId;
}

function getBatchIdForAction() {
  if (activeBatchId > 0n) return activeBatchId;
  return parseBatchId($('live-claim-batch-id')?.value || '0');
}

function readUint(hex, index) {
  const clean = hex.replace(/^0x/, '');
  const word = clean.slice(index * 64, index * 64 + 64) || '0';
  return BigInt(`0x${word}`);
}

function readBool(hex) {
  return readUint(hex, 0) === 1n;
}

function formatDiem(wei) {
  const value = Number(wei) / 1e18;
  return value.toLocaleString(undefined, { maximumFractionDigits: 9 });
}

function shortAddress(address) {
  if (!address) return 'Not connected';
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
