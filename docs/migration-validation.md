# Personal deployment preparation: verification

Checked locally on 2026-09-16. Production migration is still pending.

- TypeScript type checking passed.
- The complete Vinext/Cloudflare production build passed.
- A separate local D1 database accepted both normalized migrations.
- Compiled Worker smoke test: homepage 200, all 14 referenced CSS/JavaScript assets 200, catalog with eight demo products 200, anonymous admin API denied with 403, foreign-origin mutation denied with 403.
- Tests confirm private preview fails closed when credentials are missing, rejects the wrong secret, and only allows public access when explicitly configured.
- Fresh catalog initialization stays below the Workers Free D1 query limit, creates eight products and 40 variants, and preserves existing stock on repeated initialization.
- Migration tests confirm all five triggers, atomic stock reservation, overselling prevention, repeated release handling and purchased-cart updates.
- Payment event tests pass for refund-before-completion, event replay, amount mismatch and unpaid deferral using isolated fixtures, with no real payment requests.
- A heuristic current-source audit found no matches for known local setup credentials, common credential patterns or former company deployment identifiers. Private state, tokens, exports and personal resource IDs are excluded from the public tree. This scan does not prove that every possible unknown secret is absent.

The smoke test found and fixed missing static-asset forwarding behind the private preview gate. Both an ASSETS binding and explicit Worker forwarding are required when all requests run through the Worker first.

Still unverified: actual Workers Free CPU usage for password hashing and page rendering, large admin operations, full production D1 export/restore, complete R2 inventory/copy, cloud-hosted private access, independent admin login, real email and payment integrations, and source retirement. Existing catalog rows use external demo photography; that does not prove the source R2 bucket is empty.

No company-hosted resource was changed or deleted by this preparation. No paid subscription was activated.
