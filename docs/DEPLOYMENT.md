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

`wrangler.jsonc` already pins database `proparty-management` to ID `7f6ae9c1-131c-40f2-838b-c6581c618755`. Use this existing database; you do not need to create another one. If using different resources, update `database_id`, `database_name` and `bucket_name` in the config, and the database scripts in `package.json`.

## 2. Apply the schema before registration

```sh
npm ci
npm run db:remote
```

Run these commands in a terminal from the repository root. Authenticate with `npx wrangler login` first if needed. Do not skip this: the landing page can deploy successfully while registration fails because the tables do not exist.

Run `npm run db:remote` again whenever a release adds a numbered migration (for example `0002_indexes.sql`). Wrangler applies only the migrations not yet recorded in the database. Never edit a migration that has already been applied; add a new numbered file instead.

**Apply new migrations before deploying the code that ships with them.** From `0003` on, the code reads columns those migrations add (`email_verified_at`, `voided`, `locale`, `has_thumb`, `updated_at`, `sessions.created_at`); deployed first, signed-in requests fail until the migrations run. Every migration is additive, so running them ahead of the code is safe. The safest setup is the combined deploy command in step 3.

### Recovering from an incomplete console import

Pull the latest `main` and run `npm run db:remote`. The initial migration uses `IF NOT EXISTS`, so it can complete a partially imported initial schema without dropping existing tables or rows. This is recovery for this initial schema, not a mechanism for upgrading an unrelated database schema. Do not paste `0001_initial.sql` into a database that already has later migrations: it would re-create the one-active-lease index that `0003` removed.

Alternatively, copy the complete updated `migrations/0001_initial.sql` into the D1 console for `proparty-management`. The payment-limit trigger uses a `WHEN` clause to avoid the nested `CASE ... END` pattern associated with D1's `incomplete input` parsing error. Keep each trigger together, including its final `END;`; if the console rejects a batch, use the terminal command above.

Verify all three accounting triggers exist:

```sql
SELECT name FROM sqlite_master
WHERE type = 'trigger'
  AND name IN ('payment_limit', 'payment_apply', 'payment_reverse')
ORDER BY name;
```

Expected: `payment_apply`, `payment_limit`, `payment_reverse`. All three are required for payment limits, balance updates and reversals.

## 3. Connect GitHub in Workers Builds

Select `radoslav1992/proparty-management`, branch `main`, repository root.

- Node version: **24** (use Node 24 to match the CI configuration).
- Build command: `npm run build`
- Deploy command: `npx wrangler deploy`
- There is no manually configured Pages output directory. Astro generates `dist/server/wrangler.json` and `.wrangler/deploy/config.json` so Wrangler selects the built Worker automatically.

For an existing, pinned D1 database, use `npm run db:remote && npx wrangler deploy` as the deploy command so migrations always run before the code that needs them. The build token needs the corresponding D1/R2/Workers permissions.

### Daily job

`wrangler.jsonc` registers a Cron Trigger (`17 3 * * *`, 03:17 UTC) handled by `src/worker.ts`. Each run creates the current month's rent charge for every active lease, ends leases whose last day has passed, and deletes expired sessions, rate-limit counters, reset and confirmation tokens, AI usage older than 30 days and Stripe event ids older than 30 days. It deploys with the Worker; nothing needs setting up in the dashboard. Check runs under the Worker's Settings → Trigger Events.

CLI deployment: `npm run deploy`.

## 4. Variables and secrets

No session-signing key is needed: 32-byte random session tokens are stored only as SHA-256 hashes in D1, with HttpOnly cookies. A session ends after seven days without use and 30 days after sign-in at the latest. Passwords are PBKDF2-SHA256 hashes stored with their parameters (`pbkdf2-sha256$iterations$salt$hash`); hashes in the older format are rewritten at the user's next sign-in. Astro's separate KV session feature is disabled; there is no KV resource to configure.

Set variables in Worker Settings → Variables and Secrets. `keep_vars: true` preserves dashboard variables across builds.

| Name                     | Required               | Purpose                                                    |
| ------------------------ | ---------------------- | ---------------------------------------------------------- |
| `AI_MODEL`               | No                     | Defaults to `@cf/meta/llama-3.3-70b-instruct-fp8-fast`     |
| `RESEND_API_KEY`         | For email              | Password-reset and email-confirmation messages             |
| `EMAIL_FROM`             | For email              | Verified sender, e.g. `Proparty <noreply@your-domain.com>` |
| `STRIPE_SECRET_KEY`      | For paid subscriptions | Stripe secret key                                          |
| `STRIPE_WEBHOOK_SECRET`  | For paid subscriptions | Webhook signing secret                                     |
| `STRIPE_PRICE_LANDLORD`  | For paid subscriptions | Monthly recurring price for the Landlord plan              |
| `STRIPE_PRICE_PORTFOLIO` | For paid subscriptions | Monthly recurring price for the Portfolio plan             |

Cloudflare's `AI` binding provides access directly. No OpenAI, Gemini, or external inference key is required. Use a Workers AI chat model that accepts the `messages` input shape; Google/OpenAI partner model shapes are not interchangeable.

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
npm run lint
npm run format:check
npm run check
npm test
python3 tests/database.py
npm run build
```

Run `npm run test:integration` for the complete local suite. Its runner starts the built Worker twice with explicit ports and a shared local D1/R2 persistence directory: once for the HTTP tests and the Playwright browser smoke test (`npx playwright install chromium` first), and once with a placeholder email provider to cover email confirmation. Use a disposable local database: the tests create sample accounts and records.

## Before opening to customers

- Verify signup, sign-in, a property photo upload, and an AI question on the deployed domain.
- Configure and verify email (`RESEND_API_KEY`, `EMAIL_FROM`). Without it, password recovery shows a clear unavailable message and email confirmation is skipped. With it, new accounts must confirm their address before using the AI assistant or uploads; accounts created before migration `0003` are treated as confirmed.
- Replace the privacy/terms overview with the operator's actual identity, contact and retention policy before commercial launch.
- Verify Stripe with test mode first if enabling subscriptions.
- Keep important property documents backed up independently. Users can download their data and delete their account from Settings; decide how long backups of deleted accounts are kept and say so in the privacy policy.

## Product boundaries

Rent payments are entered manually; this release does not collect tenant payments or connect to banks. The daily job creates the current month's charge for each active lease; other months are generated from the rent ledger. Generation is idempotent per lease/month. First/last partial months use the full monthly rent (no automatic prorating), and due dates are moved inside the lease's start and end dates. Due days are 1–28. Unpaid charges can be edited or removed (removed charges are kept as voided and never regenerated). Leases can be edited and ended on a chosen date; ending early deletes later unpaid charges. A property can hold several active leases as long as their dates do not overlap, so the next tenant can be entered in advance.

The assistant uses a bounded account-only snapshot of properties, recent charges and open maintenance, plus the last six messages of the conversation. Answers stream to the browser and are shown as a small, escaped Markdown subset. It does not receive uploaded documents, perform writes, send messages, or supply legal/tax advice. AI costs are limited by daily atomic D1 quotas; a request that fails before the answer starts refunds the quota.

The workspace loads the last 24 months of payments, charges and expenses plus every unpaid charge, and fetches older months when a user picks them; tenant statements always use the full history. Payments, charges and leases are recorded in an append-only `audit_log` (shown under Activity, included in the data export).

The demo is read-only and separate from real account data. New accounts start empty. R2 files are limited to JPEG/PNG/WebP/PDF, 10 MB each, 30 per property. Photos get a thumbnail made in the browser (at most 640 px wide, without camera metadata) stored beside the original as `<key>.thumb`; originals are kept unchanged. Interface text is English; the date and number format is a per-user setting.

Scheduled outbound reminders, tenant login portals, team invitations, OCR, automated rent collection, and bank feeds are not implemented or advertised as active features.
