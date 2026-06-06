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

- [wstDIEM Protocol Plan](docs/wstdiem-protocol-plan.md) — architecture and phased roadmap for wrapping staked Venice DIEM and syncing inference allowance to `wstDIEM` balances.
