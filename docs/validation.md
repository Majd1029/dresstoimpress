# Validation record

The storefront is ready for private demonstration and owner setup. This record does not certify readiness to accept real payments.

## Automated checks

- TypeScript: `node node_modules/typescript/bin/tsc --noEmit` passed.
- Full Vinext build passed across RSC, client and SSR environments.
- `node tests/integration.mjs`: **24/24 passed**, recorded 2026-09-14 at 10:52 UTC against local HTTP, persistent D1 and R2 emulators. Disposable QA records were subsequently removed with the generated targeted cleanup SQL.
- `node tests/payment-events.mjs`: **3/3 passed** after the final refund-ordering fix. This runs the actual webhook handler with both SQL migrations in isolated in-memory SQLite and a fake Stripe transport. It covers a refund arriving before completion, replay/completion preserving the refund, amount mismatch, and deferral when payment is not yet confirmed. It makes no external payment requests.

The integration suite covers administrator bootstrap/authorization, customer role enforcement, cross-origin writes, category/product CRUD, publish/duplicate/delete, server price validation, stock availability, unacknowledged demo rejection, order idempotency, preservation of new bag items, concurrent last-item checkout, stale inventory edits, account/order/address ownership, switching accounts, order management, CMS/settings persistence, newsletter consent, invalid webhook signatures, upload type/size rejection and valid retrieval, password reset expiry/single-use/session revocation, public routes/metadata/sitemap/404, and logout.

The payment-event regression checks were added after the integration run. The final refund change is covered by those focused checks; it does not change the demo checkout paths covered by the HTTP suite.

## Browser review

The compiled production Worker also started locally: the homepage returned 200 and anonymous admin navigation redirected to sign-in.

The local site was inspected in the Codex browser at desktop (1440 pixels), intermediate/tablet sizing, and mobile (390 pixels).

- Home hero, collection cards, editorial sections and typography visually checked; all 18 homepage images loaded at desktop sizing.
- Desktop and mobile page widths checked for horizontal overflow.
- Search for blazer returned two matching products; mobile filters and stock selection responded correctly.
- Product gallery, size choice and add-to-bag interaction checked.
- Mobile bag and checkout reviewed for readable totals, usable form fields, and clear demo disclosures.
- Read-only WebMCP catalog search accepted valid input and rejected an invalid query type.
- Browser logs retained old development hot-reload connection errors from an earlier server restart. No new errors appeared during the final bag/checkout navigation.

This is a focused review, not a complete assistive-technology, browser compatibility, or performance audit.

## Required before real sales

1. Replace clearly marked demo photography/products/prices and placeholder brand details with approved content. Instagram was inaccessible; see `brand-and-assets.md`.
2. Configure the owner account, real contact details, shipping destinations/costs, tax handling and reviewed policies. Remove the setup secret after creating the administrator.
3. Use a separate staging Site/database for Stripe test mode. Verify hosted success, decline, cancellation, expiry, duplicate/out-of-order webhooks and refunds with Stripe. Do not switch a database containing Stripe test orders or outstanding test sessions to live keys.
4. Verify external webhook reachability. The Site's owner-private access layer may block Stripe callbacks; private preview operation does not establish live webhook delivery.
5. Configure verified Resend credentials and test real delivery, retries, expired resets and exhausted-job recovery. Email delivery was not tested against Resend.
6. Configure the maintenance scheduler and operational monitoring. No external scheduler was created.
7. Run deployment-specific load, backup/restore, accessibility and security checks. Vinext is a beta adapter; D1 limits and password hashing concurrency need validation under expected traffic.

No live Stripe charge, real refund, real customer email, sustained-load benchmark, or jurisdiction-specific policy review was performed. Demo orders do not represent payments or fulfillment commitments.

## Hosted SQL compatibility

The first hosted attempt rejected a trigger migration with `incomplete input: SQLITE_ERROR`. Cloudflare has documented parser issues with [unparenthesized CASE expressions in triggers](https://github.com/cloudflare/workers-sdk/issues/4727) and [CRLF migration line endings](https://github.com/cloudflare/workers-sdk/issues/14991). Deployment copies now use LF and parenthesize the stock trigger's CASE expression. The original applied migrations and their identities remain unchanged. `node tests/migration-package.mjs` verifies all five triggers install and stock reservation, repeated release, overselling rejection, and purchased-cart updates preserve their behavior. The corrected archive deployed successfully to the owner-private Site on 2026-09-15. The personal migration branch now prepares these corrected copies with `npm run db:prepare`; the former staging script is retired.
