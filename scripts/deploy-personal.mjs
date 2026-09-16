// Intentionally cannot provision resources, activate billing, or fall back to a
// previously signed-in account. Complete the migration checklist before use.
import './local-env.mjs';
import {existsSync, readFileSync, writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const settingsFile = new URL('../config/personal-cloudflare.json', import.meta.url);
if (!existsSync(settingsFile)) throw new Error('Personal Cloudflare setup is pending. Follow docs/personal-migration.md.');
const settings = JSON.parse(readFileSync(settingsFile, 'utf8'));
if (settings.ownerEmail !== 'dresssstoooo@gmail.com' || settings.githubRepository !== 'Majd1029/dresstoimpress') {
  throw new Error('The destination does not match the requested personal accounts.');
}
if (!/^[a-f0-9]{32}$/.test(settings.accountId) ||
    !/^[a-f0-9-]{36}$/.test(settings.databaseId) || settings.databaseId === '00000000-0000-4000-8000-000000000000') {
  throw new Error('Verified personal account and D1 IDs are required.');
}
const origin = new URL(settings.appUrl);
if (origin.protocol !== 'https:' || !origin.hostname.endsWith('.workers.dev') ||
    origin.username || origin.password || origin.port || origin.pathname !== '/' || origin.search || origin.hash) {
  throw new Error('Use the exact personal HTTPS workers.dev origin.');
}
if (settings.freePlanVerified !== true) throw new Error('Verify this personal account uses Workers Free before deployment.');
if (settings.r2BillingApproved !== true) throw new Error('R2 billing is not authorized. Do not enable it under the no-payment requirement.');
if (settings.sourceDataVerified !== true) throw new Error('Full source database and R2 copy must be verified before deployment.');
if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(settings.bucketName)) throw new Error('Invalid personal bucket name.');

const token = process.env.PERSONAL_CLOUDFLARE_API_TOKEN;
if (!token) throw new Error('Configure PERSONAL_CLOUDFLARE_API_TOKEN securely in this terminal or GitHub Actions secrets.');
async function api(path) {
  const response = await fetch('https://api.cloudflare.com/client/v4' + path, {
    headers: {Authorization: 'Bearer ' + token},
  });
  const body = await response.json();
  if (!response.ok || !body.success) throw new Error('Personal Cloudflare identity/resource verification failed; check token permissions.');
  return body.result;
}
const user = await api('/user');
if (user.email?.toLowerCase() !== settings.ownerEmail) throw new Error('Cloudflare token belongs to a different identity.');
await api(`/accounts/${settings.accountId}`);
const namespace = await api(`/accounts/${settings.accountId}/workers/subdomain`);
if (!namespace.subdomain || origin.origin !== `https://dresstoimpress.${namespace.subdomain}.workers.dev`) {
  throw new Error('APP_URL does not match the dresstoimpress Worker in the verified personal account.');
}
await api(`/accounts/${settings.accountId}/d1/database/${settings.databaseId}`);
await api(`/accounts/${settings.accountId}/r2/buckets/${encodeURIComponent(settings.bucketName)}`);

const output = new URL('../dist/server/wrangler.json', import.meta.url);
if (!existsSync(output)) throw new Error('Run npm run build first.');
const configuration = JSON.parse(readFileSync(output, 'utf8'));
configuration.name = 'dresstoimpress';
configuration.account_id = settings.accountId;
configuration.workers_dev = true;
configuration.preview_urls = false;
configuration.assets = {...configuration.assets, run_worker_first: true};
configuration.vars = {...configuration.vars, APP_URL: origin.origin, SITE_VISIBILITY: 'private'};
configuration.d1_databases = [{binding: 'DB', database_name: 'dresstoimpress-db', database_id: settings.databaseId}];
configuration.r2_buckets = [{binding: 'BUCKET', bucket_name: settings.bucketName}];
writeFileSync(output, JSON.stringify(configuration, null, 2) + '\n');

// Remove other ambient Cloudflare authentication before invoking Wrangler.
const environment = {...process.env};
for (const name of Object.keys(environment)) if (/^(CLOUDFLARE_|CF_)/.test(name)) delete environment[name];
delete environment.PERSONAL_CLOUDFLARE_API_TOKEN;
environment.CLOUDFLARE_API_TOKEN = token;
environment.CLOUDFLARE_ACCOUNT_ID = settings.accountId;
environment.WRANGLER_SEND_METRICS = 'false';
const result = spawnSync(process.execPath, [fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url)),
  'deploy', '--config', fileURLToPath(output)], {env: environment, stdio: 'inherit'});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
