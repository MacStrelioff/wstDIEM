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
