# Venice DIEM Contract and API Research

This note records the concrete external context used by the wstDIEM MVP design.

## DIEM token and staking contract

- Chain: Base mainnet.
- DIEM token/staking contract: [`0xf4d97f2da56e8c3098f3a8d538db630a2606a024`](https://base.blockscout.com/address/0xf4d97f2da56e8c3098f3a8d538db630a2606a024).
- Contract name from Blockscout verified source: `Diem`.
- Solidity compiler from Blockscout: `0.8.26+commit.8a97fa7a`.
- Token metadata from Base RPC / Blockscout:
  - name: `Diem`
  - symbol: `DIEM`
  - decimals: `18`
  - ERC-20 type
- Current contract values observed through Base RPC:
  - `cooldownDuration() = 86400` seconds (`1 days`)
  - `totalStaked() ≈ 27315.52926027613 DIEM`
  - `totalSupply() ≈ 37160.30351604224 DIEM`

## Verified DIEM staking ABI surface

The DIEM contract is both the ERC-20 token and the staking contract. Relevant functions and events from the verified ABI/source:

```solidity
function stake(uint256 amount) external;
function initiateUnstake(uint256 amount) external;
function unstake() external;
function stakedInfos(address user) external view returns (
    uint256 amountStaked,
    uint256 coolDownEnd,
    uint256 coolDownAmount
);
function cooldownDuration() external view returns (uint256);
function totalStaked() external view returns (uint256);

event Staked(address indexed user, uint256 amount);
event UnstakeInitiated(address indexed user, uint256 amount);
event Unstaked(address indexed user, uint256 amount);
event CooldownDurationUpdated(uint256 cooldownDuration);
```

Important source behavior:

- `stake(amount)` requires the caller to already hold DIEM. It increments `totalStaked`, increments `stakedInfos[msg.sender].amountStaked`, and transfers DIEM from `msg.sender` to the DIEM contract using internal `_update(msg.sender, address(this), amount)`. No ERC-20 approval is needed for `stake()` because the caller is moving its own balance.
- `initiateUnstake(amount)` moves stake from active staked amount into the caller's cooldown bucket. It sets `stakedInfo.coolDownEnd = block.timestamp + cooldownDuration`, increments `coolDownAmount`, and decrements `amountStaked`.
- Multiple `initiateUnstake()` calls by the same address reset `coolDownEnd` for the full aggregate `coolDownAmount`. This is critical for wstDIEM: a vault contract has only one DIEM cooldown bucket, so the wrapper must batch redemption requests rather than initiating a new on-chain unstake for every user request.
- `unstake()` is callable after `coolDownEnd`. It transfers the full `coolDownAmount` back from the DIEM contract to `msg.sender`, resets `coolDownAmount` and `coolDownEnd`, and decrements `totalStaked`.

## Recent on-chain behavior confirming staking flow

Recent Base transactions to the DIEM contract show all three staking methods in active use:

| Method | Example tx | Timestamp | Notes |
| --- | --- | --- | --- |
| `stake(uint256)` | [`0xd15f479b1d606979eeb8fc4c312f48497443e36b4633214e32f4245690e11ea5`](https://base.blockscout.com/tx/0xd15f479b1d606979eeb8fc4c312f48497443e36b4633214e32f4245690e11ea5) | 2026-06-06 17:16:25 UTC | Staked `4 DIEM`. |
| `initiateUnstake(uint256)` | [`0xdc186d5ea8b4e08ed2921649eb09e5b606c16d05e77a9d06df8376abf0fd9771`](https://base.blockscout.com/tx/0xdc186d5ea8b4e08ed2921649eb09e5b606c16d05e77a9d06df8376abf0fd9771) | 2026-06-06 17:17:03 UTC | Initiated unstake of `4 DIEM`. |
| `unstake()` | [`0x94d61679c0d3c210f32bde864566409cb4fdd51e48ad81b457066ac3c1ad19b6`](https://base.blockscout.com/tx/0x94d61679c0d3c210f32bde864566409cb4fdd51e48ad81b457066ac3c1ad19b6) | 2026-06-06 17:20:57 UTC | Completed a cooldown withdrawal. |

## Venice API docs used for MVP design

Primary documentation references:

- Venice API docs root: <https://docs.venice.ai/>
- OpenAPI spec: <https://api.venice.ai/doc/api/swagger.yaml>
- API key generation guide: <https://docs.venice.ai/guides/getting-started/generating-api-key>
- Autonomous wallet API key guide: <https://docs.venice.ai/guides/getting-started/generating-api-key-agent>
- API key endpoints:
  - `POST /api_keys`
  - `PATCH /api_keys`
  - `DELETE /api_keys`
  - `GET /api_keys`
  - `GET /api_keys/{id}`
  - `GET /api_keys/generate_web3_key`
  - `POST /api_keys/generate_web3_key`
- Billing endpoints:
  - `GET /billing/balance`
  - `GET /billing/usage`
- Pricing page: <https://docs.venice.ai/overview/pricing>

Key doc facts:

- Venice API uses Bearer API keys: `Authorization: Bearer <api-key>`.
- Venice API implements an OpenAI-compatible API under `https://api.venice.ai/api/v1`.
- Pricing page states: `1 Diem = $1/day of compute`.
- Pricing page payment options include staking DIEM: `Each Diem = $1/day of credits that refresh daily`.
- API keys can be `ADMIN` or `INFERENCE`.
- Venice docs state: Admin keys can delete or generate additional API keys programmatically; Inference Only keys are permitted to run inference.
- API keys support `consumptionLimit` / `consumptionLimits` including a `diem` field.
- API keys support `limitPeriod` values: `EPOCH`, `MONTH`, `LIFETIME`. `EPOCH` resets every UTC day.
- `GET /billing/balance` returns:
  - `canConsume`
  - `consumptionCurrency`
  - `balances.diem`
  - `balances.usd`
  - `diemEpochAllocation`
- The API key guide says generated keys are only shown once.
- The autonomous wallet key endpoint flow is:
  1. `GET /api_keys/generate_web3_key` returns a short-lived token.
  2. Wallet signs the raw token string with `personal_sign` semantics.
  3. `POST /api_keys/generate_web3_key` with `address`, `signature`, `token`, and `apiKeyType` creates the key.

## Inherited DIEM contract/admin risks

The DIEM/Venice contract audit notes that DIEM includes privileged minter/burner/admin roles and an externally controlled cooldown duration. wstDIEM cannot remove those upstream risks; it can only surface them and avoid adding new custody/key risks. The vault implementation should read `cooldownDuration()` dynamically and should not hard-code the 24-hour value as a permanent invariant.

## Important integration question: contract-staked DIEM attribution

The user requirement is that wstDIEM is contract-controlled from day 1: the wstDIEM vault contract accepts DIEM deposits, calls the DIEM contract's `stake()`, and later calls `initiateUnstake()` / `unstake()` for redemptions.

The API docs clearly support API keys and per-key DIEM consumption limits, but the public wallet-key guide currently describes wallet-authenticated key minting around staked VVV/sVVV. For wstDIEM to work as intended, Venice must attribute the vault contract's staked DIEM to a protocol Venice account/admin key, or otherwise support an admin API key whose `diemEpochAllocation` tracks `DIEM.stakedInfos(wstDIEMVault).amountStaked`.

This is the first E2E integration gate:

```text
After the vault stakes DIEM, the protocol admin key's GET /billing/balance should report
balances.diem / diemEpochAllocation consistent with the vault's staked DIEM.
```

If a smart-contract address cannot be associated with a Venice admin account because it cannot sign the Web3 key challenge, wstDIEM needs Venice-side support or an explicit account-linking flow. The MVP design assumes this is resolvable and keeps the DIEM custody/staking path contract-controlled regardless.
