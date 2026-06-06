const BALANCE_OF_SELECTOR = '0x70a08231';

export async function resolveEffectiveWstDiemWei({ env = process.env, body = {}, address }) {
  if (env.ALLOW_CLIENT_BALANCE_OVERRIDE === 'true' && body.effectiveWstDiemWei != null) {
    return String(body.effectiveWstDiemWei);
  }
  return readErc20Balance({
    rpcUrl: env.BASE_RPC_URL || 'https://mainnet.base.org',
    token: env.WSTDIEM_TOKEN_ADDRESS,
    address,
  });
}

export async function readErc20Balance({ rpcUrl, token, address }) {
  if (!token) throw new Error('WSTDIEM_TOKEN_ADDRESS is required');
  if (!address) throw new Error('address is required');
  const data = `${BALANCE_OF_SELECTOR}${address.toLowerCase().replace(/^0x/, '').padStart(64, '0')}`;
  const result = await jsonRpc({ rpcUrl, method: 'eth_call', params: [{ to: token, data }, 'latest'] });
  return BigInt(result).toString();
}

export async function readDiemStakeInfo({ env = process.env, staker }) {
  const rpcUrl = env.BASE_RPC_URL || 'https://mainnet.base.org';
  const diem = env.DIEM_ADDRESS || '0xF4d97F2da56e8c3098f3a8D538DB630A2606a024';
  const selector = '0x9503b15c'; // stakedInfos(address)
  const data = `${selector}${staker.toLowerCase().replace(/^0x/, '').padStart(64, '0')}`;
  const result = await jsonRpc({ rpcUrl, method: 'eth_call', params: [{ to: diem, data }, 'latest'] });
  const hex = result.replace(/^0x/, '').padStart(192, '0');
  return {
    amountStakedWei: BigInt(`0x${hex.slice(0, 64)}`).toString(),
    coolDownEnd: BigInt(`0x${hex.slice(64, 128)}`).toString(),
    coolDownAmountWei: BigInt(`0x${hex.slice(128, 192)}`).toString(),
  };
}

export async function jsonRpc({ rpcUrl, method, params }) {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const payload = await response.json();
  if (payload.error) throw new Error(payload.error.message || 'RPC error');
  return payload.result;
}
