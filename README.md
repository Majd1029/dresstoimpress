# Dress to Impress

An editorial fashion store with a database-backed catalog, customer accounts, guest checkout, protected owner dashboard, cloud image uploads, and a Stripe-hosted payment integration.

The initial collection is explicitly **demo content**. Instagram could not be accessed, so the ivory, ink and oxblood design is a proposed direction, not a claim about the brand's actual aesthetic. No real prices, store locations, reviews, shipping promises or contact details were invented.

## What is included

- Home, catalog search/filter/sort/pagination, product galleries and zoom, size/color options, bag, checkout, confirmation, account/profile/addresses, order history, information and policy pages.
- Owner dashboard at `/admin`: products, image upload/reordering/alt text, variants, stock thresholds, categories, orders, customers, subscribers, homepage content and settings.
- Relational D1 (SQLite) database with Drizzle schemas/migrations, foreign keys, uniqueness/check constraints, and transactional stock triggers.
- Opaque server-stored sessions, salted scrypt password hashes, CSRF/origin checks, database-backed throttling, role checks and customer ownership checks.
- Bounded D1 image storage: 1 MiB per new upload and a 100 MiB media budget. Original object imports support up to 5 MiB each; the complete source bucket inventory contained no objects.
- Server-priced Stripe Checkout, signed raw-body webhook verification, idempotent order confirmation, expiry recovery, refunds, and durable email outbox.
- Responsive layouts, semantic landmarks, focus states, accessible Radix controls, reduced motion, page metadata, product social metadata, sitemap and robots.
- A read-only WebMCP catalog search tool with input validation.

## Technology and project layout

The application uses TypeScript, React, Next.js App Router APIs through the Vinext Cloudflare adapter, Tailwind CSS, Drizzle, Cloudflare D1 and a private SQLite-backed Durable Object for password hashing. The backend runs in the owner's personal Cloudflare Free account at https://dresstoimpress.majdaguir29.workers.dev in private preview. Data migration is verified; old-resource retirement is pending. It uses relational SQLite rather than PostgreSQL. Vinext is a pre-1.0 adapter; run deployment/load checks for the intended production environment before accepting real payments.

```text
app/                     Server-rendered routes, metadata, API, error boundaries
components/store/        Storefront, accounts, forms and admin interfaces
components/ui/           Existing accessible UI primitives
lib/auth.ts              Sessions, passwords, CSRF, rate limits, email queue delivery
lib/commerce.ts          Cart, stock reservation, Stripe, refunds, order ownership
lib/admin.ts             Owner-only product/content/order operations
lib/db.ts                Prepared database access and explicit demo seed
lib/validation.ts        Shared server validation
lib/brand.ts              Replaceable initial branding and demo imagery
db/schema.ts             Relational schema
drizzle/                 Versioned SQL migrations and snapshots
tests/integration.mjs     Disposable local integration checks
docs/                    Brand sources, operational notes and validation report
```

## 1. Install

Install Node.js 24 or newer, then open a terminal in this directory:

```sh
npm ci
```

The included lockfile pins dependencies. On Windows, if an npm shell shim looks for npm inside this project, invoke the installed npm JavaScript entry directly:

```powershell
node "C:\Program Files\nodejs\node_modules\npm\bin\npm-cli.js" ci
```

## 2. Set local configuration

Copy `.env.example` to `.dev.vars`. The Cloudflare preview reads `.dev.vars`; hosting reads secrets and variables stored in the personal Cloudflare Worker.

Generate a different strong token for the owner setup and for maintenance:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Keep `APP_URL=http://localhost:5173` locally. On a deployed site, set it to the exact HTTPS origin. It is used for payment callbacks, password reset links and origin validation.

No default administrator or password is shipped. Secrets are ignored by Git. Application sessions use random 256-bit opaque tokens, so an additional signing secret is not required.

## 3. Initialize the local database

The local bindings in `wrangler.jsonc` are `DB` and `BUCKET`. Local development emulates D1 and R2 in `.wrangler/state`; it does not create billed cloud resources.

For a fresh local database:

```sh
npm run db:prepare
npm run db:local
```

Do not run initial migrations against an already initialized database. The normalized copies preserve trigger compatibility while leaving applied source migrations unchanged.

The first store request inserts demo records once using idempotent database writes. Removing demo content from admin does not reseed it: the settings record remains the initialization marker. Do not delete the settings record to perform routine cleanup.

After changing the schema, run `npm run db:generate`, inspect the SQL, and apply only newly generated migrations. Do not edit an applied migration. Nonconstant defaults are unsuitable for ordinary SQLite ADD COLUMN operations.

## 4. Run the site

```sh
npm run dev
```

Open the printed local URL (normally `http://localhost:5173`). The preview reloads when source changes.

`npm start` previews a previously built Worker, sharing the same local database and image storage. It does not publish.

## 5. Create the first administrator

1. Set `ADMIN_SETUP_TOKEN` in local `.dev.vars` or the deployed site's secret environment settings.
2. Visit `/admin/login` and choose **First time? Set up the owner account**.
3. Enter your name, email, a password of at least 12 characters, and the setup token.
4. After successful creation, remove `ADMIN_SETUP_TOKEN` from the environment and restart/redeploy.

The first admin creation is guarded both by the token and a database trigger. Customer registration always creates a customer. There is no browser shortcut that grants admin rights.

To recover an account, configure email delivery, then use **Forgot password?** Reset links expire after 30 minutes and are single-use. Resetting a password revokes existing sessions. No reset token is returned by a public API.

## 6. Manage the store

- **Products:** Add/edit a piece, choose category and variants, upload or add licensed HTTPS images, add descriptions/materials/care, prices and SKU, then publish. Use flags for homepage features, arrivals and best sellers. Best-seller labels require genuine owner knowledge for real merchandise.
- **Inventory:** Quantities mean available-to-purchase stock, excluding checkout reservations. Concurrent changes reject stale inventory edits. Product metadata edits preserve unchanged inventory.
- **Orders:** Search/open orders and advance fulfillment status. Cancelling does not refund or restock. The refunded action issues a full Stripe refund for a real paid order and clearly asks for confirmation in the dashboard. Restock separately after checking returned merchandise.
- **Categories:** Create, rename, set display order and images. Move products elsewhere before deleting a used category.
- **Homepage:** Change the hero, editorial text, promotions, about section and manually managed Instagram gallery.
- **Settings:** Configure contact/social links, currency, logo, color/font, shipping destinations, flat shipping fee, tax and all policies.
- **Demo removal:** Settings includes a confirmation to remove demo products and orders. Product deletion is blocked when order history must be preserved; unpublish instead. Removing an image from a product removes its reference; old R2 objects can be retained for safe recovery.

Currency changes relabel the store's minor-unit amounts; they do not convert prices. Update all prices appropriately before changing currency and launch. The implementation restricts currencies to two-decimal currencies.

## 7. Configure Stripe

1. Use a separate staging Worker and D1 database for Stripe test keys, test customers and test orders. Do not mix Stripe test-mode history with live store data: paid Stripe test orders use the ordinary order workflow and are included in that staging dashboard's revenue.
2. Set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, and the exact HTTPS `APP_URL` server-side.
3. Subscribe to `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired`, and `charge.refunded`.
4. For local testing, run:
   ```sh
   stripe listen --forward-to localhost:5173/api/stripe/webhook
   ```
5. Use the CLI-provided signing secret locally.
6. Replace demo products, configure shipping/country/policies and enable sales in Settings while still using test keys.
7. Test success, decline, cancelled navigation, expiry, duplicate and out-of-order webhook delivery and full refunds in staging. Set live keys only on the separate production store with no test orders or unresolved test attempts. Never switch a database containing outstanding Stripe sessions between payment environments.

Stripe must be able to reach the webhook endpoint. The private preview gate blocks external webhook requests. Verify public webhook reachability on an explicitly authorized staging deployment before payment testing; the private demo alone does not verify webhook delivery. Keep live sales disabled until this is resolved for the production deployment.

Only immediate card payments are enabled. Card details are collected entirely on Stripe's hosted page. The storefront never receives or stores raw card data. Customer, address, immutable price and quantity snapshots are saved before redirect. A checkout attempt reserves stock; a real order is created only after server verification of a paid Stripe session.

A cancelled browser redirect does not release stock because payment could still complete. Reservations last 35 minutes on Stripe. Webhooks and maintenance recover expired attempts. Retries reuse saved parameters and the same Stripe idempotency key. Older ambiguous attempts are reconciled against Stripe sessions before releasing stock. High-volume recovery scans are bounded; monitor the outstanding attempts table and payment/email service errors.

When sales are disabled, the explicit demo confirmation creates a persisted demo order. It takes no money and makes no delivery claim. Live checkout refuses demo products.

## 8. Configure email

Set `EMAIL_API_KEY` to a Resend API key and `EMAIL_FROM` to a verified sender. Confirmation/reset messages are placed in `email_outbox`; delivery attempts occur after order/reset operations and during maintenance. Jobs retry up to five times with stable provider idempotency keys.

Without credentials, messages remain queued. The preview does not pretend an email was delivered. Inspect failures and use **Retry queued emails** after fixing configuration; this retries jobs that have fewer than five attempts. For an exhausted order confirmation, inspect the selected job, check the provider's delivery records to avoid duplicating an already delivered message, then reset only that job using a prepared SQL statement:

```sql
UPDATE email_outbox SET attempts=0
WHERE id=? AND status='pending' AND attempts>=5 AND dedupe_key LIKE 'order:%';
```

Then run **Retry queued emails**. Do not reset all outbox attempts. For an exhausted or expired password-reset message, request a fresh password-reset link instead. Treat outbox contents as sensitive: reset links and order addresses are admin/server data.

## 9. Images

The `BUCKET` binding must point to an owner-controlled R2 bucket. Real R2 activation requires a separate billing decision; it is currently paused under the no-payment requirement. No image secret is sent to the browser. Uploads require admin authorization and CSRF validation, allow JPEG/PNG/WebP only, check file signatures, and cap each file at 5 MB and the request at 15 MB. SVG and arbitrary executable content are not accepted. The client checks image decoding and prepares optimized WebP files; ordered image URLs and alt text live in the database.

Stock image sources and licenses are listed in `docs/brand-and-assets.md`. Replace all demo photography with photos you own or have permission to publish.

## 10. Deploy

Follow [the personal migration checklist](docs/personal-migration.md). The checked-in Wrangler configuration is deliberately local-only: it has no account ID, uses a placeholder database ID, and disables remote preview URLs. Do not deploy it directly.

After verifying personal resources and the complete data copy, use the guarded `npm run deploy:personal` command. It requires a private configuration file and a personal API token, checks identity and resource access, and keeps the hosted preview private. Missing preview credentials fail closed. No resources or paid subscriptions are automatically provisioned.

GitHub CI runs validation and the build. Automatic deployment remains disabled until the migration and account configuration are verified. The previous source deployment is retained for rollback; no live data has been moved by these code changes.

## 11. Maintenance

Set `MAINTENANCE_SECRET` and arrange a server-side scheduler to POST `/api/maintenance` with `Authorization: Bearer <secret>` every five minutes after public launch. Never expose this secret in browser code or cron URLs. The private preview gate also blocks bearer-only maintenance requests. Run the owner dashboard's maintenance actions during private review, and configure scheduling after the launch/access decision.

This checks expired checkout sessions and retries queued emails. Stripe webhooks remain the primary payment confirmation path. Configure monitoring and alerting for webhook delivery failures, unresolved reservations, email failures, database limits and application errors.

## 12. Validate

```sh
npm run check
npm run build
node tests/integration.mjs
node tests/payment-events.mjs
node tests/migration-package.mjs
```

The integration script is strictly for an isolated local database with no existing administrator. It creates disposable QA users/products/orders and writes a targeted cleanup SQL file to `.sites-runtime/qa-cleanup.sql`. Never run it against a store containing real accounts or orders. Apply that cleanup only to the same local test database.

See `docs/validation.md` for the actual recorded checks and external-service limitations. Live Stripe payments, production email delivery, sustained traffic, jurisdiction-specific taxes/policies and the final real catalog require owner configuration and launch verification.
