# wstDIEM Protocol Plan

> Planning document for a wrapped staked DIEM protocol on Base.

## Current status

This plan has been updated with concrete DIEM/Venice findings from docs and on-chain inspection.

Detailed follow-up docs:

- [wstDIEM MVP Architecture](wstdiem-mvp-architecture.md) — end-to-end MVP design from deposit to inference usage to 24h DIEM redemption.
- [Venice DIEM Contract and API Research](references/venice-diem-contract-and-api-research.md) — source-backed context for DIEM staking contract, Venice API key endpoints, billing endpoints, and API pricing.

## Summary

`wstDIEM` is a wrapped staked DIEM receipt token.

Users deposit DIEM into a Base smart contract vault. The vault stakes that DIEM through Venice's DIEM contract and mints `wstDIEM` to the user 1:1. A backend service uses a protocol Venice admin key to provision one Venice inference key per wallet, with each key's DIEM allowance synced to the wallet's active `wstDIEM` balance.

Users can redeem `wstDIEM` back to DIEM. Redemption must respect the DIEM staking contract's 24-hour cooldown, so the vault batches redemption requests and calls `initiateUnstake()` / `unstake()` on behalf of users.

## Concrete external facts

- Chain: Base.
- DIEM token/staking contract: [`0xf4d97f2da56e8c3098f3a8d538db630a2606a024`](https://base.blockscout.com/address/0xf4d97f2da56e8c3098f3a8d538db630a2606a024).
- DIEM decimals: `18`.
- DIEM staking methods: `stake(uint256)`, `initiateUnstake(uint256)`, `unstake()`.
- DIEM cooldown: `cooldownDuration() = 86400` seconds / 24 hours.
- Venice pricing: `1 Diem = $1/day of compute`.
- Venice API keys can be `ADMIN` or `INFERENCE`.
- Venice API key consumption limits support `diem` and `limitPeriod = EPOCH`.
- Venice billing balance returns `balances.diem` and `diemEpochAllocation`.

## MVP goals

- Contract-controlled DIEM custody and staking from day 1.
- Deposit DIEM, stake immediately, mint `wstDIEM` 1:1.
- One Venice inference key per wallet.
- Privy-authenticated app and API routes.
- User key DIEM allowance synced to active `wstDIEM.balanceOf(wallet)`.
- Redeem `wstDIEM` back to DIEM through DIEM's 24-hour cooldown.
- No plaintext Venice keys in GitHub, browser bundles, logs, or on-chain storage.

## Non-goals for MVP

- No LP-held `wstDIEM` allowance yet. LP accounting is V2.
- No fully transferable V1 `wstDIEM` unless paired with protocol-enforced epoch usage accounting.
- No multiple simultaneous DIEM cooldown batches, because the DIEM contract only has one cooldown bucket per staking address.
- No off-chain DIEM staking/custody.
- No fully public on-chain storage of raw or encrypted bearer API keys.

## V1: wallet-held wstDIEM allowance

Recommended V1 policy: make `wstDIEM` non-transferable or transfer-restricted until the protocol has a usage-aware inference proxy or global epoch accounting. That avoids same-day allowance double-spend caused by spend-then-transfer behavior.

```text
eligibleDiem(wallet) = activeNonRedeemingWstDiemBalance(wallet)
veniceKeyLimit(wallet) = eligibleDiem(wallet) - protocolReserve
```

When a user deposits DIEM, their `wstDIEM` balance rises and the sync worker increases their key limit. When a user requests redemption, the vault burns/locks `wstDIEM` immediately and the sync worker lowers their key limit. If V1 permits transfers, transfer events must also trigger immediate limit reductions/increases and the implementation needs an epoch spent ledger to prevent already-spent allowance from following the token to a new wallet.

## V2: wallet + LP-held wstDIEM allowance

V2 can add supported LP positions:

```text
eligibleDiem(wallet) = walletHeldWstDiem + supportedLpWstDiemExposure
```

V2 needs audited LP adapters, time-weighting or anti-flash-loan controls, and pool allowlists before any LP exposure counts toward Venice allowance.

## High-level architecture

```mermaid
flowchart TD
  User[User wallet] -->|Privy auth| App[Next.js wstDIEM app]
  User -->|deposit DIEM| Vault[wstDIEMVault]
  Vault -->|stake(amount)| DIEM[DIEM token + staking contract]
  Vault -->|mint/burn| Token[wstDIEM ERC-20]

  App --> API[wstDIEM API]
  API --> Registry[(Encrypted key registry)]
  API --> Sync[Allowance sync worker]
  Sync -->|read wstDIEM balances| Token
  Sync -->|create/update/revoke inference keys| Venice[Venice API]

  User -->|requestRedeem(wstDIEM)| Vault
  Vault -->|batched initiateUnstake| DIEM
  Vault -->|after 24h unstake| DIEM
  User -->|claim DIEM| Vault
```

## Deposit flow

1. User logs in with Privy and connects a Base wallet.
2. User approves DIEM to the vault.
3. User calls `deposit(amount)`.
4. Vault transfers DIEM from user to vault.
5. Vault calls `DIEM.stake(amount)`.
6. Vault mints `wstDIEM` to the user 1:1.
7. Backend syncs the user's Venice key limit to their new `wstDIEM` balance.

## Inference key flow

1. User authenticates with Privy.
2. Backend verifies the Privy identity token and wallet ownership.
3. Backend creates one Venice `INFERENCE` key for the wallet using the protocol Venice `ADMIN` key.
4. Backend sets `consumptionLimits.diem` to the user's eligible `wstDIEM` balance with `limitPeriod = EPOCH`.
5. Backend stores key metadata and encrypted key material.
6. User copies the Venice key and uses it with `https://api.venice.ai/api/v1`.

## Redemption flow

1. User calls `requestRedeem(amount)`.
2. Vault burns or locks the user's `wstDIEM` immediately.
3. User's inference eligibility decreases immediately.
4. Request enters an open redemption batch.
5. Vault starts one on-chain cooldown batch with `DIEM.initiateUnstake(batchAmount)`.
6. The batch waits 24 hours.
7. Anyone can call `completeUnstakeBatch()` after the cooldown, which calls `DIEM.unstake()`.
8. Users in the batch call `claimRedeemed(batchId)` to receive DIEM.

Important: new redemption requests during an active cooldown must wait for the next batch. Calling `initiateUnstake()` again during an active cooldown resets the DIEM contract's cooldown timestamp for the full vault cooldown amount.

## Privy and key ownership

The MVP should use the Surplus Intelligence Privy pattern:

- `@privy-io/react-auth` for login.
- `@privy-io/wagmi` for Base wallet integration.
- server-side `@privy-io/server-auth` identity token verification.
- backend routes derive the wallet from the verified identity/session, not from untrusted request bodies.

The wallet that owns `wstDIEM` is the wallet that owns the Venice inference key.

## Key storage design

Venice keys are bearer secrets and are shown once by Venice. The MVP should:

- store Venice key ID, last 6 chars, status, and limits as metadata;
- store raw key material encrypted at rest;
- reveal/decrypt only after Privy-authenticated wallet verification;
- log key reveal and rotation events;
- allow key rotation/recreation with a cooldown.

The smart contract should not store raw or encrypted API key material. It can optionally store a non-secret key commitment/hash.

## Test strategy

Yes — the MVP should be tested mostly before using real DIEM:

1. **Local mock DIEM tests:** implement a `MockDiem` with the same `stake`, `initiateUnstake`, `unstake`, `stakedInfos`, and cooldown-reset behavior. Use this for TDD on deposits, 1:1 minting, redemption batches, claim accounting, and non-transferable V1 token behavior.
2. **Base mainnet fork tests:** run Foundry/Anvil or Hardhat against a forked Base RPC and the real DIEM contract at `0xf4d97f2da56e8c3098f3a8d538db630a2606a024`. Use local fork cheatcodes/impersonation to fund test wallets with DIEM. This exercises the real deployed DIEM bytecode without moving real DIEM.
3. **Mocked Venice adapter tests:** fake Venice key create/update/delete calls and assert `consumptionLimits.diem` tracks active non-redeeming `wstDIEM` balances.
4. **Venice API smoke test:** with a real Venice admin key, create/patch/delete a throwaway inference key using zero or tiny limits if the API allows it. This validates request payloads without staking funds.
5. **Final dust-size real-DIEM E2E:** only after the layers above pass, use the smallest practical DIEM amount to prove the unresolved production gate: contract-staked DIEM appears in the protocol admin key's `/billing/balance.diemEpochAllocation`.

See [wstDIEM MVP Architecture](wstdiem-mvp-architecture.md#testing-plan-before-real-diem) for the detailed layered test plan.

## Required E2E proof before implementation is considered complete

With a small amount of DIEM:

1. Deploy vault + `wstDIEM`.
2. Deposit DIEM.
3. Verify `DIEM.stakedInfos(vault).amountStaked` increased.
4. Verify the protocol Venice admin key's `/billing/balance` reports a compatible `diemEpochAllocation`.
5. Create a user inference key.
6. Verify the user's key has a DIEM EPOCH limit matching their `wstDIEM` balance.
7. Make a Venice inference call with the user key.
8. Request redemption.
9. Verify the user's key limit decreases.
10. Wait 24h / complete the unstake batch.
11. Claim DIEM back.

## Primary integration risk

The smart contract can stake DIEM on-chain. The open integration question is whether Venice can attribute a contract address's staked DIEM to a protocol Venice admin key, since contracts cannot sign the public Web3 key-generation challenge. The MVP assumes this can be linked or supported by Venice, and the first real-DIEM E2E test must prove it.

## Remaining open questions before implementation

1. **Contract-staked DIEM attribution:** can Venice link `stakedInfos(vault).amountStaked` to the protocol admin key's `diemEpochAllocation`?
2. **V1 transfer policy:** will V1 make `wstDIEM` non-transferable/transfer-restricted, or should the app ship a protocol inference proxy/global epoch ledger from day one?
3. **Exact Venice key-management payloads:** admin API docs use `consumptionLimits`; the implementation should smoke-test create/update/delete on a throwaway key before wiring production keys.
4. **User key recoverability policy:** should raw user inference keys be recoverable from encrypted storage, or shown once with rotation-only recovery?
5. **Operational reserve factor:** how much DIEM allocation should remain unassigned to user keys to absorb rounding, stale sync, already-spent usage, API lag, and account-level allocation changes?
6. **DIEM admin-risk disclosure:** what UX copy should tell users that DIEM has privileged upstream roles and externally controlled cooldown parameters?
