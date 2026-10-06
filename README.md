# Proparty

An Astro property-management SaaS for independent landlords and small rental portfolios, prepared for Cloudflare Workers, D1, R2 and Workers AI.

## Included

- Responsive marketing site adapted from the supplied property-management template, using its photography and the same GSAP directional blur reveals, ScrollTrigger timing and Lenis desktop smooth scrolling. Reduced-motion preferences are respected.
- Account registration with email confirmation, login, password change, sign-out of other devices and configurable password recovery.
- Empty private workspaces and a separate read-only demo at `/demo`.
- Properties, tenant directory, leases (editable, with advance bookings) and monthly rent charges created daily.
- Partial payments, overdue list across months, printable tenant statements, payment reversals and expense tracking.
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
npm run lint
npm run format:check
npm run check
npm test
python3 tests/database.py
npm run build
```

`npm run test:integration` runs the built Worker locally and exercises it over HTTP (`tests/integration.mjs`, `tests/integration-email.mjs`) and in Chromium (`tests/smoke.mjs`), including two-account isolation, partial payments, private uploads, invalid origin rejection, the daily job, CSV export and Content-Security-Policy violations. See the deployment guide for details.

## Structure

- `src/pages/index.astro`: landing page
- `src/components/Workspace.astro`, `src/scripts/workspace.ts`: application UI
- `src/pages/api/[...path].ts`: authenticated API
- `src/worker.ts`, `src/lib/jobs.ts`: Worker entry and the daily Cron Trigger job
- `src/lib`: auth, validation, billing and Cloudflare bindings
- `migrations`: D1 schema and financial invariants
- `public/images`, `public/vendor`: selected template assets and animation libraries

The purchased template's assets retain their original rights; they are not relicensed by this repository. No unnecessary generated images were added because the supplied property imagery fits this product.
