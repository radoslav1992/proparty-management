# Deploy Proparty to Cloudflare Workers

This is an Astro 7 application using the official Cloudflare adapter, D1, a private R2 bucket, and Workers AI. It is built for **Workers**, not Pages. The repository name intentionally matches `proparty-management`.

## 1. Create your resources

In Cloudflare, create:

| Resource    | Name                        | Binding          |
| ----------- | --------------------------- | ---------------- |
| D1 database | `proparty-management`       | `DB`             |
| R2 bucket   | `proparty-management-files` | `PROPERTY_FILES` |
| Workers AI  | No separate resource        | `AI`             |

Keep the R2 bucket private. Images are served through authenticated `/api/files/:id` requests. Do not enable public bucket access.

CLI alternative (after `npx wrangler login`):

```sh
npx wrangler d1 create proparty-management
npx wrangler r2 bucket create proparty-management-files
```

Paste the D1 `database_id` into the existing `d1_databases[0]` object in `wrangler.jsonc`. If using different names, update `database_name` and `bucket_name` there and the database scripts in `package.json`.

A missing D1 ID is intentional while awaiting the target account. Current Wrangler supports automatic provisioning on deployment, but explicitly creating and pinning the database first makes migrations and subsequent GitHub builds deterministic.

## 2. Apply the schema before registration

```sh
npm ci
npm run db:remote
```

Or execute `migrations/0001_initial.sql` in the new database's D1 console. Do not skip this: the landing page can deploy successfully while registration fails because the tables do not exist.

## 3. Connect GitHub in Workers Builds

Select `radoslav1992/proparty-management`, branch `main`, repository root.

- Node version: **24** (use Node 24 to match the CI configuration).
- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`
- There is no manually configured Pages output directory. Astro generates `dist/server/wrangler.json` and `.wrangler/deploy/config.json` so Wrangler selects the built Worker automatically.

For an existing, pinned D1 database, you may use `npm run db:remote && npx wrangler deploy` as the deploy command to apply future migrations before releasing code. The build token needs the corresponding D1/R2/Workers permissions.

CLI deployment: `npm run deploy`.

## 4. Variables and secrets

No session-signing key is needed: 32-byte random session tokens are stored only as SHA-256 hashes in D1, with HttpOnly cookies and a seven-day expiry. Astro's separate KV session feature is disabled; there is no KV resource to configure.

Set variables in Worker Settings → Variables and Secrets. `keep_vars: true` preserves dashboard variables across builds.

| Name                     | Required               | Purpose                                                    |
| ------------------------ | ---------------------- | ---------------------------------------------------------- |
| `AI_MODEL`               | No                     | Defaults to `@cf/meta/llama-3.3-70b-instruct-fp8-fast`     |
| `RESEND_API_KEY`         | For password reset     | Secret used only for recovery emails                       |
| `EMAIL_FROM`             | For password reset     | Verified sender, e.g. `Proparty <noreply@your-domain.com>` |
| `STRIPE_SECRET_KEY`      | For paid subscriptions | Stripe secret key                                          |
| `STRIPE_WEBHOOK_SECRET`  | For paid subscriptions | Webhook signing secret                                     |
| `STRIPE_PRICE_LANDLORD`  | For paid subscriptions | Monthly recurring price for the Landlord plan              |
| `STRIPE_PRICE_PORTFOLIO` | For paid subscriptions | Monthly recurring price for the Portfolio plan             |

Cloudflare's `AI` binding provides access directly. No OpenAI, Gemini, or external inference key is required. This follows the `env.AI.run(model, { messages, ... })` pattern used for `@cf/*` models in `notebook/src/lib/ai/cloudflare.ts`. Use a Workers AI chat model accepting the `messages` input shape; Google/OpenAI partner model shapes are not interchangeable. “Luna 6” was not assumed to be a valid Cloudflare model identifier.

## Optional subscriptions

Create two recurring Stripe prices matching the desired commercial offer (the landing page proposes €19 and €49/month). Configure tax treatment and billing portal in Stripe. Add a webhook to:

```text
https://YOUR_DOMAIN/api/billing/webhook
```

Subscribe to `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, and `customer.subscription.deleted`.

Signed webhook events update plan entitlements. The handler retrieves current subscription state to avoid trusting stale event payloads. Cancellation reduces the plan to Free; existing records remain accessible, but new properties above the plan cap are blocked. Payment-method details stay with Stripe.

The application works without Stripe. Free accounts allow 3 properties and 5 AI requests/day. Landlord allows 15/30; Portfolio allows 50/100. A workspace has one manager login in this release; shared team access is not included.

## Local development

```sh
npm ci
npm run db:local
npm run dev
```

D1 and R2 are emulated locally. To test live AI, use your Cloudflare account and the Workers AI binding; local inference is not an offline model. No live inference charges are incurred by the supplied automated tests. Put optional local secrets in `.dev.vars` (gitignored).

```sh
npm run check
npm test
python3 tests/database.py
npm run build
```

Run `npm run test:integration` for the complete local HTTP suite. Its runner starts and stops the built Worker with explicit ports and a shared local D1/R2 persistence directory. Use a disposable local database: the integration test creates sample test accounts and records.

## Before opening to customers

- Verify signup, sign-in, a property photo upload, and an AI question on the deployed domain.
- Configure and verify password-recovery email. Without it, users receive a clear unavailable message.
- Replace the privacy/terms overview with the operator's actual identity, contact and retention policy before commercial launch.
- Verify Stripe with test mode first if enabling subscriptions.
- Keep important property documents backed up independently. Establish a data-retention and account-deletion process.

## Product boundaries

Rent payments are entered manually; this release does not collect tenant payments or connect to banks. Monthly charges are explicitly generated from the rent ledger and are idempotent per lease/month. First/last partial months use the full monthly rent (no automatic prorating). Due days are 1–28. A lease marked ended stops future generation; existing financial records remain intact.

The assistant uses a bounded account-only snapshot of properties, recent charges and open maintenance. It does not receive uploaded documents, perform writes, send messages, or supply legal/tax advice. AI costs are limited by daily atomic D1 quotas; failed inference refunds the quota.

The demo is read-only and separate from real account data. New accounts start empty. R2 files are limited to JPEG/PNG/WebP/PDF, 10 MB each, 30 per property.

Scheduled outbound reminders, tenant login portals, team invitations, OCR, automated rent collection, and bank feeds are not implemented or advertised as active features.
