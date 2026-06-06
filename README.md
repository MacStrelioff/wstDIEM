# wstDIEM

wstDIEM is a Base mainnet product prototype for turning DIEM stake into transferable wstDIEM shares and capped Venice inference keys.

The current branch includes two flows:

1. **Operator-staked live product V1** — transferable wstDIEM, server-side Venice ADMIN key management, per-address Venice INFERENCE keys, key limit sync from wstDIEM balances, redemption requests, and proof-of-reserves.
2. **Earlier vault-staked POC/MVP** — non-transferable proof contract plus local mock simulator retained for comparison and historical testing.

## Local development

```bash
npm install
npm test
forge test -vv
npm run build
npm run start
```

Open <http://localhost:3000>.

If you have the Vercel CLI available, you can also run:

```bash
npm run dev
```

## Live operator-staked V1

The live V1 product contracts are deployed on Base mainnet:

- DIEM: `0xF4d97F2da56e8c3098f3a8D538DB630A2606a024`
- Operator / Venice admin wallet: `0x23bB05603A980C2915FC3B9D5D4a475993b666DE`
- Operator-staked V1 vault: `0xea74b97c3660E400f90826130560926b25053a77`
- Transferable V1 wstDIEM token: `0x434dF5B0829De7B0E558D904ab96E29737D9c317`
- Deploy tx: `0xafe78175bbdf7ff94dacdb7c2bb0025802f8c9259f4f28007250a33f25fcf800`

Preview deployment tested with server-side Venice env:

- `https://wstdiem-6dhjh7t03-agentic-work.vercel.app`

### Verified live V1 E2E

The live V1 E2E used dust DIEM on Base:

1. User approved and deposited `0.002 DIEM`.
2. User received `0.002` transferable wstDIEM.
3. User transferred `0.00025` wstDIEM to `0x0e49122e76bD8B9ccb2FE10c0088C41Ceb608927`.
4. User requested redemption of `0.0005` wstDIEM.
5. Operator funded redemption request `#1`.
6. Server-side Venice ADMIN key created a capped INFERENCE key for the user's remaining wstDIEM balance.
7. The user key called Venice directly and returned `OK`.
8. After an additional `0.00005` wstDIEM transfer, backend sync patched the key cap from `0.001` to `0.00096 DIEM / epoch`.
9. The backend revoked the test key; only the ADMIN key remained active.
10. Proof-of-reserves remained solvent.

Key txs:

- Approve deposit: `0xfcfab149a922f7382d07da129657dc521a84ddbb25e1997f45d12a871d6f1062`
- Deposit/mint: `0x2f166403522b301344b39e082b82de6e85274a245315445645aeb3e325ddc5a8`
- First wstDIEM transfer: `0xde765aa1c8da639260657db67ac2579bd68d10bb947a8ef9db7a1f2cfa5d17b9`
- Request redeem: `0x675da6e33470e3943a7bdbb7298a946c397f3749cc29faa4d33eb65d5d09deea`
- Approve redemption funding: `0x7c579ba5836b3e42e8094be832e17cf95a9ea4d62a2e4cc5bf71211043028c6a`
- Fund redemption: `0xf9f9fbbc5bdb41e1cabdee47e082e067dfccca2763586bc6c749d9679598c97b`
- Second wstDIEM transfer: `0xdef7d7ae27431c8047d8f010d77a36be12e03c58a8d03fefd587b30ebca552e1`

Redemption request `#1` is funded and becomes claimable at `2026-06-07T21:25:33Z`. A scheduled Hermes job will execute `claimRedeemed(1)` and verify the final claim after cooldown.

Current post-E2E state:

- User V1 wstDIEM: `0.0012`
- Recipient V1 wstDIEM: `0.0003`
- Pending funded redemption: `0.0005 DIEM`
- Total liabilities: `0.002 DIEM`
- Total backing: `0.11253104 DIEM`
- Proof-of-reserves solvent: `true`

See [`deployments/base-mainnet.json`](deployments/base-mainnet.json) for full deployment metadata and block explorer links.

## Server-side Venice key management

The Vercel API routes live under `api/key/*`:

- `POST /api/key/create`
- `POST /api/key/status`
- `POST /api/key/sync`
- `POST /api/key/rotate`
- `POST /api/key/revoke`

The Venice ADMIN key is server-only. The frontend never receives or embeds it. Users receive their own capped Venice INFERENCE key and call Venice directly.

Required runtime env vars:

```bash
VENICE_ADMIN_API_KEY=...
KEY_ENCRYPTION_SECRET=...
BASE_RPC_URL=https://mainnet.base.org
DIEM_ADDRESS=0xF4d97F2da56e8c3098f3a8D538DB630A2606a024
WSTDIEM_TOKEN_ADDRESS=0x434dF5B0829De7B0E558D904ab96E29737D9c317
WSTDIEM_VAULT_ADDRESS=0xea74b97c3660E400f90826130560926b25053a77
WSTDIEM_RESERVE_BPS=8000
```

## Earlier vault-staked MVP deployment

The earlier non-transferable vault-staked MVP remains deployed for comparison:

- Vault: `0xE8C6F1672b578BF41e5b63903854611f9c8fbe3d`
- wstDIEM token: `0x45B37BeF8810eb27FEE2c1014B0Bfa8Bf74Ee708`
- Deploy tx: `0x8bf416b68290eec27d76effd4a60bfc4723550de8d66f5193bc3435fd7ea8f9a`

That version proved DIEM staking calls and redemption cooldown mechanics, but Venice attribution worked only for the operator EOA with `0.1 DIEM` directly staked. The live V1 product therefore uses operator-staked DIEM plus proof-of-reserves.

## Build and deploy

```bash
npm run build
```

The build copies `public/` into `dist/`. Vercel uses `vercel.json`:

- Build command: `npm run build`
- Output directory: `dist`
- Clean URLs: enabled

## Project planning

- [wstDIEM Protocol Plan](docs/wstdiem-protocol-plan.md) — concise protocol overview and V1/V2 scope.
- [wstDIEM MVP Architecture](docs/wstdiem-mvp-architecture.md) — full MVP design from DIEM deposit/stake through Venice inference usage and 24h redemption.
- [Venice Admin Key and Operator-Staked Design](docs/venice-admin-key-and-operator-design.md) — working design for real Venice inference keys using an EOA/Safe admin account while vault attribution remains unproven.
- [Venice DIEM Contract and API Research](docs/references/venice-diem-contract-and-api-research.md) — source-backed DIEM contract, on-chain transaction, and Venice API references.
