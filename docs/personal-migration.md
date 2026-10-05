# Personal deployment checklist — 2026-10-05

The store now runs privately at https://dresstoimpress.majdaguir29.workers.dev under the personal Cloudflare identity **majdaguir29@gmail.com**. Source of truth: https://github.com/Majd1029/dresstoimpress (public).

## Completed

- [x] Verified personal Wrangler OAuth and Workers Free; no paid service or domain activated.
- [x] Created the personal D1 database and restored the full source schema and data.
- [x] Froze writes on the old deployment and verified the final 24-table, 135-row snapshot. Application schema, indexes, triggers and foreign keys are preserved.
- [x] Inventoried the entire source R2 bucket: zero objects. All 16 existing product-image references are external URLs; those references are preserved.
- [x] Added bounded D1 image storage: 1 MiB per new image, 100 MiB total budget. No destination R2 subscription.
- [x] Rotated the copied administrator password, changed its email to the personal identity, revoked copied sessions/reset tokens, and generated new personal Worker secrets. These are the only intentional differences from the preserved source records.
- [x] Deployed privately and tested the storefront, catalog, administrator login/dashboard, 1 MiB upload with byte-exact download, cart and demo checkout. Removed test data and restored test inventory.
- [x] Passed TypeScript, production build, migration/stock, free-plan seeding, preview gate, payment events, D1 media and password-derivation tests.
- [x] Removed the temporary export secret from the old deployment and redeployed. The old deployment remains read-only; it has not been deleted.

## Personal access and updates

- **PERSONAL LOGIN — Cloudflare:** sign in as majdaguir29@gmail.com. Verify this identity before changing the Worker, D1, members, recovery methods or API tokens.
- **PERSONAL LOGIN — GitHub:** sign in as Majd1029. The public repo grants everyone read access, but should grant no company collaborator write/admin access.
- Preview and admin credentials are in the ignored local `.migration/personal-access.md`. Store them in a personal password manager. They are not in GitHub.
- GitHub Actions validates pushes and pull requests. Deployment remains an explicit local `npm run build` then `npm run deploy:personal`, using verified personal OAuth and ignored `config/personal-cloudflare.json`. No company deployment integration remains in the workflow. No Cloudflare OAuth refresh token has been copied into GitHub.
- The deploy helper preserves private access. Opening the storefront publicly is a separate visibility change; admin authentication remains required.
- No payment/email provider is configured. Checkout remains demo-only. Free quotas may interrupt service when exhausted; no paid fallback is enabled. Live checks are not a high-load performance certification.

## Remaining owner actions

- [ ] Open the new private storefront and administrator dashboard using the local access file.
- [ ] Review personal account members, recovery email/phone, MFA and GitHub collaborators/deploy keys. Remove any work-managed identity or device access you do not want.
- [ ] Keep the private source backups and verification reports in storage you personally own. This checkout is inside OneDrive; confirm that OneDrive account is personal before retaining credentials/backups there.
- [ ] Follow the separate private retirement checklist to delete the old Site and confirm removal of its managed repository, D1/R2 resources, secrets and retained access. Deletion has not been performed.

Do not apply initial CREATE TABLE migrations to the restored database. Original migrations were restored as schema, and the new media migration was applied separately. Before using automatic migration application, reconcile its migration ledger to this existing schema; never blindly replay the initial migrations.