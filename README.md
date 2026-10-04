# Proparty

An Astro property-management SaaS for independent landlords and small rental portfolios, prepared for Cloudflare Workers, D1, R2 and Workers AI.

## Included

- Responsive marketing site adapted from the supplied property-management template, using its photography and the same GSAP directional blur reveals, ScrollTrigger timing and Lenis desktop smooth scrolling. Reduced-motion preferences are respected.
- Account registration, login, logout and configurable password recovery.
- Empty private workspaces and a separate read-only demo at `/demo`.
- Properties, tenant directory, leases and monthly rent charges.
- Partial payments, outstanding balances, payment reversals and expense tracking.
- Maintenance board with priority, assignment and status.
- Private property images and PDF documents in R2.
- Dashboard, monthly cash-flow reports and CSV export.
- Cloudflare Workers AI assistant with account-scoped context and daily quotas.
- Optional Stripe subscriptions and signed webhooks.

## Start

```sh
npm ci
npm run db:local
npm run dev
```

## Deploy

See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) for exact Cloudflare resource names, bindings, migration instructions, build/deploy commands and optional secrets.

Resource names: D1 `proparty-management`, R2 `proparty-management-files`. Add the database ID to `wrangler.jsonc` after creating it. **Apply remote migrations before attempting to register.**

## Verify

```sh
npm run check
npm test
python3 tests/database.py
npm run build
```

`tests/integration.mjs` exercises the actual built Worker over local HTTP, including two-account isolation, partial payments, private uploads, invalid origin rejection and CSV export. See the deployment guide to start the test runtime.

## Structure

- `src/pages/index.astro`: landing page
- `src/components/Workspace.astro`, `src/scripts/workspace.ts`: application UI
- `src/pages/api/[...path].ts`: authenticated API
- `src/lib`: auth, validation, billing and Cloudflare bindings
- `migrations`: D1 schema and financial invariants
- `public/images`, `public/vendor`: selected template assets and animation libraries

The purchased template's assets retain their original rights; they are not relicensed by this repository. No unnecessary generated images were added because the supplied property imagery fits this product.
