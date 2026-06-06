# Venice Admin Key and Operator-Staked wstDIEM Design

> **Status:** Working design for real Venice inference keys when Venice cannot attribute contract-vault DIEM stake directly.

## Summary

The current Base deployment proves the vault can stake DIEM onchain and mint/burn wstDIEM-style receipts, but it does **not** prove that Venice credits those vault-staked DIEM credits to a Venice API account.

The working Venice key path we verified is EOA-based:

1. An EOA wallet stakes non-zero VVV on Base.
2. That EOA signs a Venice Web3 key token.
3. Venice mints an ADMIN API key for the account derived from that EOA.
4. The ADMIN API key can create, patch, and delete INFERENCE keys.

Therefore, unless Venice explicitly supports vault attribution or smart-contract wallet auth, the practical V1 should use a dedicated operator EOA/Safe as the Venice identity and key owner.

## Verified facts

### Contracts and addresses

- Project/operator EOA: `0x23bB05603A980C2915FC3B9D5D4a475993b666DE`
- DIEM on Base: `0xF4d97F2da56e8c3098f3a8D538DB630A2606a024`
- VVV on Base: `0xacfE6019Ed1A7Dc6f7B508C02d1b04ec88cC21bf`
- Venice VVV staking contract: `0x321b7ff75154472B18EDb199033fF4D116F340Ff`
- Prototype wstDIEM vault: `0xE8C6F1672b578BF41e5b63903854611f9c8fbe3d`
- Prototype wstDIEM token: `0x45B37BeF8810eb27FEE2c1014B0Bfa8Bf74Ee708`

### Verified key bootstrap

A tiny amount of VVV was acquired and staked from the project/operator EOA:

- ETH→VVV swap: `0x95f16215a8920a738853d1a1d57b86fe17d49418f867a58d858c8956c09d44ff`
- VVV transfer to project EOA: `0xf376d1f13bc9b5238a5b3e07a5d831ac0b1549fe7284682cd268fe7d0ad8a36d`
- VVV approval to Venice staking: `0x14a1f6b079732f41b987bad84f3e0d737db825dc16160d0c46883d4025ac483d`
- VVV stake: `0x0de99579ee3be332aeb7fbda48182388bf79522976115b2bff1a3576bc1574e3`
- Staked VVV/sVVV balance: `0.00991409301240864`

A Venice Web3 ADMIN key was minted from that EOA and stored locally outside the repo:

```text
~/.hermes/secrets/wstdiem.env
```

The secret file contains:

```bash
VENICE_ADMIN_API_KEY=...
VENICE_ADMIN_API_KEY_ID=201c8b32-ba89-458d-840b-1668acda8131
VENICE_ADMIN_ADDRESS=0x23bB05603A980C2915FC3B9D5D4a475993b666DE
```

Never commit or print `VENICE_ADMIN_API_KEY`.

### Verified admin operations

Using the minted Venice ADMIN key, we successfully:

- called `GET /billing/balance`;
- created a throwaway `INFERENCE` key;
- patched the throwaway key's `consumptionLimit.diem`;
- deleted the throwaway key;
- verified only the ADMIN key remained active.

### Verified operator DIEM attribution

After the tiny `0.001 DIEM` direct stake returned no spendable billing allocation, the project/operator EOA staked an additional `0.099 DIEM` to reach Venice's documented `0.1 DIEM` spendability threshold:

- Additional DIEM stake tx: `0xbee462505a3765a55cd689ba8834ecb4ccbc407e8d3ce0ce204eb4411331989a`
- Direct operator DIEM staked: `0.1 DIEM`
- Liquid DIEM left in the operator EOA after staking: `0.01253104 DIEM`

Venice billing then immediately returned:

```json
{
  "canConsume": true,
  "consumptionCurrency": "DIEM",
  "balances": {
    "diem": 0.1,
    "usd": null
  },
  "diemEpochAllocation": 0.1
}
```

A capped throwaway `INFERENCE` key was also created from the admin key, used for a direct Venice chat-completions request (`"OK"` response), and deleted. Cleanup verification showed only the Web3 ADMIN key remained active.

This proves the operator EOA/Safe-staked V1 path works for real Venice inference keys once the Venice-attributed staking account has at least `0.1 DIEM` staked.

## Why a vault alone is not enough today

A contract vault has two separate problems:

1. **It cannot sign the Venice Web3 key token as an EOA.**
   - Venice's documented Web3 key flow asks for an address, token, and `personal_sign` signature from the wallet.
   - The docs do not currently document EIP-1271 / smart-contract wallet verification.
   - A Solidity vault cannot produce an EOA private-key signature.

2. **Venice attribution for vault-staked DIEM is still unproven.**
   - The prototype vault has staked DIEM onchain.
   - The EOA-minted Venice admin key reports `diemEpochAllocation: 0.1` only after the operator EOA directly staked `0.1 DIEM`.
   - This proves EOA/operator attribution, but not vault attribution. Venice may only credit the Venice-authenticated account/staker unless they support delegated vault attribution or smart-contract wallet auth.

A vault is still useful for custody/accounting, but a vault alone cannot currently mint/manage Venice API keys or prove Venice billing attribution.

## Practical V1 architecture

Use a dedicated operator EOA or, preferably, a dedicated Safe as the Venice identity.

```text
Users
  hold transferable wstDIEM

Vault
  accepts DIEM deposits, mints/burns wstDIEM, tracks redemptions

Operator EOA/Safe
  stakes VVV to own the Venice ADMIN key
  stakes DIEM if Venice only credits the authenticated staking account

Backend Key Manager
  holds VENICE_ADMIN_API_KEY server-side
  creates/patches/deletes per-address Venice INFERENCE keys

Venice
  bills the operator account and enforces per-key limits
```

### Admin key owner

For the MVP, the operator can be the existing project EOA. For production, migrate to a dedicated Safe if Venice's Web3 auth and dashboard/account model support the Safe or a Safe-controlled operational EOA.

Recommended production split:

- **Operator Safe:** custody and DIEM staking authority.
- **Key-manager server:** stores `VENICE_ADMIN_API_KEY`, creates/patches/deletes inference keys.
- **Hot EOA:** only if required for Venice Web3 signing; keep minimal authority and rotate/migrate to Safe if Venice supports it.

## User key lifecycle

The backend keeps a registry:

```ts
type UserKey = {
  address: `0x${string}`;
  veniceKeyId: string;
  encryptedApiKey: string;
  keyLast6: string;
  status: 'active' | 'revoked' | 'rotating';
  effectiveWstDiem: string;
  targetDiemLimit: string;
  actualDiemLimit: string;
  currentEpochUsageDiem: string;
  overusedThisEpochDiem: string;
  lastPatchedAt: string;
};
```

### Create key

When an address first requests access:

1. User signs in with wallet.
2. Backend reads current effective wstDIEM balance.
3. Backend computes target DIEM limit.
4. Backend creates an `INFERENCE` key:

```json
{
  "apiKeyType": "INFERENCE",
  "description": "wstDIEM key for 0xUserAddress",
  "limitPeriod": "EPOCH",
  "consumptionLimit": {
    "diem": 0.42
  }
}
```

5. Backend stores the key ID and encrypted key secret.
6. User can reveal/copy the limited key and call Venice directly.

### Patch key

On transfers, deposits, redemptions, or periodic reconciliation:

```json
{
  "id": "venice-key-id",
  "limitPeriod": "EPOCH",
  "consumptionLimit": {
    "diem": 0.37
  }
}
```

### Revoke key

When effective wstDIEM reaches zero or the user rotates/revokes:

```http
DELETE /api_keys?id=<venice-key-id>
```

## Transferable wstDIEM and key alignment

wstDIEM should be a normal transferable ERC20 if it is meant to LP, trade, or become collateral.

The API key is not embedded in the token. The backend aligns each address's Venice inference key limit to the address's effective wstDIEM exposure.

```text
targetDiemLimit = effectiveWstDiem * reserveFactor * allocationFactor
```

Recommended initial mode:

- **Current-balance mode:** key limits track current effective balances, patched quickly after events.
- **Reserve factor:** start at `0.80` to `0.90` to absorb event/indexing lag and overuse.
- **Limit period:** use `EPOCH` so exposure resets daily.

Alternative later:

- **Epoch-snapshot mode:** simpler accounting, but sellers keep current-epoch quota and buyers wait until next epoch.

## Race conditions without a proxy

Because users call Venice directly, enforcement cannot be perfectly atomic with ERC20 transfers.

Example:

```text
Alice has 10 wstDIEM and a 9 DIEM/day key limit.
Alice spends 5 DIEM.
Alice transfers/sells down to 1 wstDIEM.
Backend sees the transfer and patches her key down.
There is a small window before the patch lands.
```

Mitigations:

- watch transfer/deposit/redeem events;
- run frequent reconciliation;
- patch keys immediately on balance decreases;
- use `EPOCH` limits, not monthly/lifetime unlimited limits;
- allocate only a reserve-adjusted fraction of total Venice allocation;
- track `currentPeriodUsage` and set lowered limits to prevent additional use;
- carry over overuse by reducing future quota if needed;
- apply stricter rules to high-value accounts.

## Vault design under operator-staked V1

If Venice only credits the operator EOA/Safe, the vault cannot be the sole staker. The vault becomes the user-facing accounting and redemption layer.

```text
Deposit:
  user sends DIEM to vault
  vault mints transferable wstDIEM shares
  operator strategy stakes pooled DIEM from vault/Safe

Redeem:
  user burns wstDIEM via requestWithdraw
  backend immediately patches/deletes user's key limit
  operator/Safe initiates DIEM unstake for the batch
  after cooldown, operator/Safe returns DIEM to vault
  user claims DIEM from vault
```

The public solvency invariant must be visible:

```text
wstDIEM totalSupply
+ pending withdrawal liabilities
<= operator active staked DIEM
 + operator cooldown DIEM
 + operator liquid DIEM
 + vault liquid DIEM
```

If this invariant fails, the system is undercollateralized.

## Path to trustless vault attribution

The cleaner V2 keeps DIEM in the vault and has the vault stake directly.

That requires one of:

- Venice manually maps the vault address to the project Venice account;
- Venice supports EIP-1271 / smart-contract wallet Web3 key auth;
- Venice adds delegated stake-source configuration;
- Venice confirms that vault-staked DIEM credits the same admin account after the `0.1 DIEM` threshold / epoch refresh.

Until one of those is proven, the working V1 is the operator EOA/Safe design.

## Backend services

### `KeyManager`

- loads `VENICE_ADMIN_API_KEY` from server env;
- creates `INFERENCE` keys;
- patches `consumptionLimit.diem`;
- deletes/rotates keys;
- never exposes the admin key.

### `BalanceIndexer`

- watches `Transfer` events for wstDIEM;
- watches vault deposit/redeem/claim events;
- later supports LP/lending adapters for effective balance;
- computes per-address effective wstDIEM.

### `Reconciler`

- periodically compares target limits to Venice key limits;
- patches drift;
- detects overuse;
- verifies total issued limits do not exceed reserve-adjusted Venice allocation;
- alerts if `/billing/balance.diemEpochAllocation` drops or becomes zero.

### `UserKey API`

No inference proxy. Only key lifecycle endpoints:

```text
POST /api/key/create
POST /api/key/reveal
POST /api/key/rotate
POST /api/key/revoke
GET  /api/key/status
```

Users call Venice directly with their limited inference key.

## Required environment variables

Server-side only:

```bash
VENICE_ADMIN_API_KEY=...
VENICE_ADMIN_API_KEY_ID=...
VENICE_ADMIN_ADDRESS=0x...
BASE_RPC_URL=...
WSTDIEM_VAULT_ADDRESS=0x...
WSTDIEM_TOKEN_ADDRESS=0x...
DIEM_ADDRESS=0xF4d97F2da56e8c3098f3a8D538DB630A2606a024
```

If the server also controls staking/redemption operations for an EOA operator:

```bash
OPERATOR_PRIVATE_KEY=...
OPERATOR_ADDRESS=0x...
```

For production, prefer Safe-controlled staking/custody over an EOA private key where Venice supports the operational flow.

## Next gates

1. Implement operator-staked V1 backend key management against the proven Venice ADMIN key path.
2. Update the vault/token design from non-transferable receipt toward transferable wstDIEM plus offchain key-limit reconciliation, if LP/lending compatibility is required.
3. Build proof-of-reserves accounting for operator-staked DIEM, operator cooldown DIEM, operator liquid DIEM, and vault liquid DIEM.
4. Ask Venice whether vault address attribution or EIP-1271 Web3 auth is supported.
5. If vault attribution is confirmed, migrate from operator-staked V1 to vault-staked V2.
