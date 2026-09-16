# Personal Cloudflare migration checklist

Target: the owner's personal Cloudflare account, public GitHub repository `Majd1029/dresstoimpress`, and a free `workers.dev` address. No domain purchase or paid upgrade is authorized. This document describes preparation; it is not evidence that production has moved.

## 1. Verify personal identities

- [x] **PERSONAL LOGIN — Cloudflare:** verified the personal account and its sole listed member with Super Administrator privileges; Workers Free is active and no payment method is present. Account ID is recorded only in ignored local configuration. Recovery methods and API-token review remain pending.
- [x] **PERSONAL LOGIN — GitHub:** created public `Majd1029/dresstoimpress` in the personal account. Browser owner and existing command-line credential identity both verified.
- [ ] Verify command-line authentication separately. A browser sign-in does not sign Wrangler or Git into that account. Never paste passwords or API tokens into chat, source files, Git remotes, or command arguments.
- [ ] Use personal recovery methods. Public GitHub source remains readable by everyone, including the former hosting organization; only administration, secrets, and deployment control can be restricted exclusively to the personal owner.

## 2. Resolve cost and Free-plan constraints

- [x] Workers **Free** is active. No paid plan or domain purchased.
- [ ] **OWNER DECISION REQUIRED — R2:** leave real R2 activation paused under the current no-payment requirement. R2 requires a subscription checkout and has usage charges beyond its free allowance. A free allowance is not a spending cap. See [R2 setup](https://developers.cloudflare.com/r2/get-started/) and [pricing](https://developers.cloudflare.com/r2/pricing/).
- [ ] If strict zero billing remains mandatory, agree on an alternative image-storage design before changing the requested R2 migration. Do not silently omit images or remove uploads and call the migration complete.
- [ ] Measure the finished application on Workers Free. Its CPU budget is 10 ms per HTTP request; the current scrypt password derivation may require moving to a Free SQLite-backed Durable Object. Do not weaken password hashes to fit the limit. See [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) and [Durable Objects limits](https://developers.cloudflare.com/durable-objects/platform/limits/).
- [x] Bulk demo seeding now stays below the 50-query D1 limit for a fresh catalog page. Large admin mutations still need testing against actual Free quotas.
- [ ] Keep live payments and paid email services disabled. No Stripe or email credentials are currently configured in the source hosting environment. Normal email delivery also needs a suitable verified sender.

## 3. Preserve and inventory the source

- [x] Preserve the pre-migration source revision locally. The local backup and all exports belong in ignored `.migration/`, never in the public repository.
- [x] Inspect source database and environment metadata. The source viewer returned 23 application tables; the inspected pages contained one user/administrator, no orders, and 16 product-image references. This is a limited inventory, **not a full export**. Recheck before cutover.
- [ ] Establish authorized access to the actual source D1 and R2 resources. Managed Sites access does not automatically provide their Cloudflare account ID, database UUID, bucket name, or S3 credentials.
- [ ] Obtain a complete provider export if direct credentials are unavailable. An authorized temporary application export is another possible path, but must include full schema, every table and value, and a paginated listing of every bucket object. It has not been implemented or deployed.
- [ ] Record source schema, row counts, object keys, lengths, HTTP metadata, custom metadata, and content hashes. Include unreferenced/orphan objects; following product-image URLs alone is insufficient.
- [ ] Schedule a final source write freeze before the final export so edits cannot be lost between copies. Keep the source available for rollback until verification completes.

## 4. Create personal resources and copy all data

- [x] **PERSONAL LOGIN — Cloudflare:** created empty `dresstoimpress-db` in the verified personal Free account; its actual UUID is recorded privately. No schema or data imported yet.
- [ ] **PERSONAL LOGIN — Cloudflare:** create `dresstoimpress-media` only after resolving R2 billing authorization. Configure source read-only access and destination write access with the smallest necessary scope.
- [ ] With direct authorized Cloudflare access, export and restore the database using separate explicit source/destination configurations:

  ```sh
  npx wrangler d1 export SOURCE_DB --remote --config SOURCE_CONFIG --output=.migration/source-database.sql
  npx wrangler d1 execute DB --remote --config PERSONAL_CONFIG --file=.migration/source-database.sql
  ```

  Replace every uppercase placeholder with verified values before running. Export the full schema and data, not selected tables. Export temporarily blocks database requests. Restore into an empty destination; do not also apply the initial CREATE TABLE migrations to that restored schema. Reconcile migration history before future schema changes. [D1 import/export](https://developers.cloudflare.com/d1/best-practices/import-export-data/)

- [ ] For a genuinely empty new store only, `npm run db:prepare` creates normalized copies of immutable migrations. Apply these copies remotely, never modify previously applied SQL. A migration is not a substitute for importing the existing live data.
- [ ] Copy every R2 object, preserving keys and metadata. Cloudflare Super Slurper supports R2-to-R2 copies; alternatively use separately configured rclone remotes:

  ```sh
  rclone copy SOURCE:SOURCE_BUCKET PERSONAL:DESTINATION_BUCKET --metadata
  rclone check SOURCE:SOURCE_BUCKET PERSONAL:DESTINATION_BUCKET --download
  ```

  These checks incur storage operations; use only after the storage-cost decision. Compare metadata separately, and inspect transfer failures. Never use a destructive sync or delete the source as part of the copy. [Cloudflare Super Slurper](https://developers.cloudflare.com/r2/data-migration/super-slurper/), [rclone verification](https://rclone.org/commands/rclone_check/)

- [ ] Compare source/destination schema, all table contents, constraints/triggers, object count, total bytes, content checksums, and metadata. Save a private verification report. Treat row counts alone as insufficient.

## 5. Configure personal deployment and credentials

- [x] Detach the active build from Sites identity, mock ChatGPT authentication, and company URL defaults. The application retains its own admin/customer authentication.
- [x] Add standalone `wrangler.jsonc`, a private-preview Worker wrapper, normalized migration preparation, and GitHub validation CI.
- [ ] Copy `config/personal-cloudflare.example.json` to ignored `config/personal-cloudflare.json` and fill only verified personal account/resource IDs and the personal `workers.dev` origin. Verification flags record completed human checks; setting them does not perform those checks.
- [ ] Generate a new `PREVIEW_ACCESS_PASSWORD` and `MAINTENANCE_SECRET` directly in personal secret storage. Remove the old setup secret; the imported database already has an administrator. Use a new setup token only if intentionally creating a genuinely empty store.
- [ ] Revoke active sessions and password-reset tokens **after** preserving and checking the full migrated dataset; review cart/order dependencies before deleting session rows. Reset the administrator password through a controlled recovery process, since its old verifier existed on the former infrastructure. These security changes must be explicit and recorded separately from the raw migration.
- [ ] If payment/email integrations are introduced later, create personal service accounts, keys, webhook endpoints and sender configuration. Do not copy old organization credentials.
- [ ] A user-scoped personal Cloudflare token for `deploy:personal` needs User Details Read to verify identity, Account Settings Read, D1 Read, R2 Read, and Workers Scripts Edit for the selected personal account. Create broader resource-write credentials only for the specific provisioning/import step. Check current permission names in the Cloudflare token UI. Store the token as `PERSONAL_CLOUDFLARE_API_TOKEN` in a private terminal environment or protected CI secret, never Git.
- [ ] Run `npm run check`, `npm run build`, then the guarded `npm run deploy:personal` after all prerequisites are satisfied. The script verifies token identity and resource access and sets an explicit account ID. It cannot prove legal account ownership; the dashboard check above remains essential.
- [ ] Set new private-preview credentials in the personal Worker before review. Missing credentials fail closed. The wrapper protects assets as well as application routes. Temporary Basic authentication also blocks external payment webhooks and bearer-auth maintenance; enable those only after the planned launch/access decision.
- [ ] Keep deployment manual until migration is accepted. The current GitHub workflow only validates/builds; pull requests get no Cloudflare secrets or live exports. Add guarded CI deployment after personal resources and authentication are verified.

## 6. Publish the clean source and verify independently

- [ ] Audit the exact files and Git history being published for secrets, company configuration, private exports, generated logs and credentials. `.gitignore` alone does not remove already-tracked or historical data. Rotate any exposed credentials rather than merely deleting their current file.
- [ ] Push the reviewed source to `Majd1029/dresstoimpress` and confirm `main` contains the intended commit. Set that personal GitHub repository as `origin`; retire the former deployment remote and scripts.
- [ ] Test the personal URL using an account/browser with no company ChatGPT session: private access gate, admin login, customer login, catalog, all images, uploads, cart, stock, demo checkout, and order history. Test denied admin access too.
- [ ] Verify real CPU and D1 query limits on the **Free** runtime, not only local emulation. Resolve failures before launch.
- [ ] Prove backup restoration and confirm personal members, CI permissions, API tokens and third-party integrations contain no company principals.
- [ ] Record the final source commit, URL, owner account/resource IDs and verification results privately. Obtain the intended storefront audience decision before switching `SITE_VISIBILITY` to `public`.

## 7. Retire the former hosting — only after verification

Do not execute deletion while any earlier migration check is incomplete. No source resource has been deleted by this preparation.

- [ ] Preserve an owner-controlled final backup and choose an explicit rollback cutoff.
- [ ] **SOURCE OWNER LOGIN REQUIRED:** in the source Sites management interface, select this exact project and inspect its actual unpublish/delete controls. The available connector has no project/repository deletion operation. Exact UI steps and the deletion scope must be verified at that point; do not assume deleting a chat deletes its deployment or repository.
- [ ] Stop the source deployment and its automated builds/schedules. Verify the old URL no longer serves the application.
- [ ] Remove the project's source Worker, D1, R2 and environment secrets through the provider's supported deletion procedure. If these are managed resources without exposed controls, request project-specific deletion from the hosting provider and retain its confirmation. Do not delete unrelated company resources.
- [ ] Remove the project's private source repository on its actual host, or obtain provider confirmation that it was deleted with the project. That host is not GitHub, so GitHub's menu labels cannot be assumed. **Archiving preserves a readable copy and does not meet a requirement that the company retain no source.**
- [ ] Revoke old project-scoped tokens, integrations, deployment hooks and any access to the personal resources. Rotate all personal secrets that ever existed on the source infrastructure.
- [ ] Verify source resources are absent and personal resources still function. Provider backups, retention policies and existing clones cannot be erased by changing a remote or deleting a live deployment; obtain the provider's retention/deletion statement if this matters. Public source remains publicly readable.
