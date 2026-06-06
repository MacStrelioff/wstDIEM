# wstDIEM

A lightweight, Vercel-ready static web app for the wstDIEM project.

## Local development

```bash
npm install
npm run build
npm run start
```

Open <http://localhost:3000>.

If you have the Vercel CLI available, you can also run:

```bash
npm run dev
```

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
