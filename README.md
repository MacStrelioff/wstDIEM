# wstDIEM

A lightweight, Vercel-ready proof-of-concept web app for the wstDIEM project. The current app is an interactive mock E2E demo for the product flow: mint mock wstDIEM, create a mock Venice inference key for the wstDIEM holder, check mock DIEM credits, and initiate mock DIEM redemption into a 24-hour cooldown batch. It does not deploy contracts, query real wallet balances, or submit onchain transactions.

## Local development

```bash
npm install
npm run test:poc
npm run build
npm run start
```

Open <http://localhost:3000>.

If you have the Vercel CLI available, you can also run:

```bash
npm run dev
```

## Live Base deployment

The live contract MVP is deployed on Base mainnet:

- DIEM: `0xF4d97F2da56e8c3098f3a8D538DB630A2606a024`
- wstDIEM Vault: `0xE8C6F1672b578BF41e5b63903854611f9c8fbe3d`
- wstDIEM token: `0x45B37BeF8810eb27FEE2c1014B0Bfa8Bf74Ee708`

Verified dust E2E transactions:

- Deploy vault: `0x8bf416b68290eec27d76effd4a60bfc4723550de8d66f5193bc3435fd7ea8f9a`
- Approve DIEM: `0x34ecdefd55da1c59f9cfd787b14ebde0fd93cd569affc86ae8666a1c56d36e7b`
- Deposit / DIEM stake / wstDIEM mint: `0x8b38114c66d5b8b3eda6194fd84769dbdf068d9d01013f1cc19b1e4f20d4cb4c`
- wstDIEM redemption initiation / DIEM cooldown: `0xb2b2ba24b58efe3d43735a495481c026cc9bf58767d1c064eb02094e9c77f222`

After the E2E, the vault has `0.0005 DIEM` active stake and `0.0005 DIEM` in DIEM cooldown. Batch `#1` becomes ready at `2026-06-07T19:50:53Z`.

See [`deployments/base-mainnet.json`](deployments/base-mainnet.json) for full deployment metadata and block explorer links.

## Proof-of-concept scope

The browser POC intentionally uses local mock state instead of real DIEM/Venice side effects. It validates the application state machine before spending real DIEM. The displayed DIEM/wstDIEM values are simulated demo balances, not the real balance of the wallet address typed into the UI:

- connect the demo Base wallet;
- deposit mock DIEM and mint wstDIEM 1:1;
- create one mock Venice inference key for the wallet that holds wstDIEM;
- check the key's DIEM/day limit and remaining credits;
- initiate redemption, reduce key credits immediately, and show the 24-hour cooldown status.

The real-DIEM/Venice attribution test remains a later manual gate after mock and fork tests pass.

## Build

```bash
npm run build
```

The build copies `public/` into `dist/`.

## Deploy to Vercel

Import this repository in Vercel. The included `vercel.json` sets:

- Build command: `npm run build`
- Output directory: `dist`
- Clean URLs: enabled

The app does not require environment variables for the current landing page.

## Project planning

- [wstDIEM Protocol Plan](docs/wstdiem-protocol-plan.md) — concise protocol overview and V1/V2 scope.
- [wstDIEM MVP Architecture](docs/wstdiem-mvp-architecture.md) — full MVP design from DIEM deposit/stake through Venice inference usage and 24h redemption.
- [Venice DIEM Contract and API Research](docs/references/venice-diem-contract-and-api-research.md) — source-backed DIEM contract, on-chain transaction, and Venice API references.
