import assert from 'node:assert/strict';
import {scryptSync, timingSafeEqual} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {performance} from 'node:perf_hooks';
import {Miniflare} from 'miniflare';
import ts from 'typescript';
import {hashPasswordWithKdf, verifyPasswordWithKdf, validPasswordHash} from '../lib/password-kdf.ts';

const options = {N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024};
const salt = '0123456789abcdef0123456789abcdef';
const password = 'A personal password — café 👗';
// Independent Node reference reproduces the previous auth.ts exactly, including
// passing the salt's hex TEXT (rather than decoded salt bytes) to scrypt.
const originalHash = value => 'scrypt:32768:8:3:' + salt + ':' + scryptSync(value, salt, 32, options).toString('hex');
const stored = originalHash(password);
const invalidHashes = [
  '', null, 7, {}, stored + '\n', stored + ':extra', stored.slice(0, -1),
  stored.replace('scrypt:', 'other:'), stored.replace(':32768:', ':16384:'),
  stored.replace(':32768:', ':1073741824:'), stored.replace(':8:', ':16:'),
  stored.replace(':3:', ':1:'), stored.replace(salt, salt.toUpperCase()),
  stored.replace(salt, 'g'.repeat(32)), stored.slice(0, -1) + 'g',
  'x'.repeat(100_000),
];

// The app-side client must not send rejected input across RPC, and it must
// allocate a different object ID for each valid operation.
const ids = [], calls = [];
let nextId = 0;
const fakeNamespace = {
  newUniqueId: () => ++nextId,
  get: id => {
    ids.push(id);
    return {
      hashPassword: async value => {calls.push(['hash', value]); return stored;},
      verifyPassword: async (value, hash) => {calls.push(['verify', value, hash]); return true;},
    };
  },
};
assert.equal(await hashPasswordWithKdf(fakeNamespace, password), stored);
assert.equal(await verifyPasswordWithKdf(fakeNamespace, password, stored), true);
assert.deepEqual(ids, [1, 2]);
assert.equal(calls.length, 2);
for (const malformed of invalidHashes) {
  assert.equal(validPasswordHash(malformed), false);
  assert.equal(await verifyPasswordWithKdf(fakeNamespace, password, malformed), false);
}
for (const invalidPassword of [null, 4, {}, 'p'.repeat(1025)]) {
  await assert.rejects(hashPasswordWithKdf(fakeNamespace, invalidPassword), /Password must/);
  assert.equal(await verifyPasswordWithKdf(fakeNamespace, invalidPassword, stored), false);
}
assert.equal(calls.length, 2, 'Rejected input must not invoke the KDF');
await assert.rejects(hashPasswordWithKdf(undefined, password), /unavailable/);
await assert.rejects(verifyPasswordWithKdf(undefined, password, stored), /unavailable/);
const unavailableNamespace = {newUniqueId: () => 1, get: () => ({hashPassword: async () => {throw new Error('RPC unavailable');}})};
await assert.rejects(hashPasswordWithKdf(unavailableNamespace, password), /RPC unavailable/);

function compiled(filename) {
  return ts.transpileModule(readFileSync(new URL('../lib/' + filename + '.ts', import.meta.url), 'utf8'), {
    compilerOptions: {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022},
  }).outputText.replaceAll("from './password-kdf'", "from './password-kdf.js'");
}

// Run the actual Durable Object class in workerd with the production
// compatibility date/flag and SQLite backend. No Cloudflare account is used.
const mf = new Miniflare({
  modulesRoot: resolve('.migration/password-test'),
  host: '127.0.0.1',
  compatibilityDate: '2026-05-15',
  compatibilityFlags: ['nodejs_compat'],
  modules: [
    {type: 'ESModule', path: resolve('.migration/password-test/index.js'), contents: `
      export {PasswordKdf} from './password-worker.js';
      export default {async fetch(request, env) {
        if (new URL(request.url).pathname !== '/test-rpc') return new Response('Not found', {status:404});
        const {method,args} = await request.json();
        if (!['hashPassword','verifyPassword'].includes(method)) return new Response('Not found', {status:404});
        try { return Response.json({value:await env.PASSWORD_KDF.get(env.PASSWORD_KDF.newUniqueId())[method](...args)}); }
        catch(error) { return Response.json({error:error.message}, {status:400}); }
      }};`},
    {type: 'ESModule', path: resolve('.migration/password-test/password-worker.js'), contents: compiled('password-worker')},
    {type: 'ESModule', path: resolve('.migration/password-test/password-kdf.js'), contents: compiled('password-kdf')},
  ],
  durableObjects: {PASSWORD_KDF: {className: 'PasswordKdf', useSQLite: true}},
  durableObjectsPersist: false,
});
try {
  const namespace = await mf.getDurableObjectNamespace('PASSWORD_KDF');
  // Exercise errors through actual Worker-to-DO RPC, avoiding Miniflare's
  // Node proxy error-serialization bug. This HTTP harness exists only here.
  const rpc = async (method, ...args) => {
    const response = await mf.dispatchFetch('http://localhost/test-rpc', {
      method:'POST', body:JSON.stringify({method,args}), headers:{'Content-Type':'application/json'},
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    return result.value;
  };
  const object = {
    hashPassword: (...args) => rpc('hashPassword', ...args),
    verifyPassword: (...args) => rpc('verifyPassword', ...args),
    fetch: (...args) => namespace.get(namespace.newUniqueId()).fetch(...args),
  };
  const start = performance.now();
  assert.equal(await object.verifyPassword(password, stored), true, 'Existing Node hashes must verify in workerd');
  const elapsed = Math.round(performance.now() - start);
  assert.equal(await object.verifyPassword(password + '!', stored), false);
  assert.equal(await object.verifyPassword(password.normalize('NFD'), stored), false, 'Do not normalize passwords');
  for (const malformed of invalidHashes) assert.equal(await object.verifyPassword(password, malformed), false);
  for (const invalidPassword of [null, 4, {}, 'p'.repeat(1025)]) {
    await assert.rejects(object.hashPassword(invalidPassword), /Password must/);
    assert.equal(await object.verifyPassword(invalidPassword, stored), false);
  }

  const first = await hashPasswordWithKdf(namespace, password);
  const second = await hashPasswordWithKdf(namespace, password);
  assert.equal(validPasswordHash(first), true);
  assert.equal(validPasswordHash(second), true);
  assert.notEqual(first.split(':')[4], second.split(':')[4], 'New hashes require fresh random salts');
  const parts = first.split(':');
  assert.ok(timingSafeEqual(Buffer.from(parts[5], 'hex'), scryptSync(password, parts[4], 32, options)), 'workerd hashes must preserve Node compatibility');
  assert.equal(await verifyPasswordWithKdf(namespace, password, first), true);

  for (const boundary of ['', 'p'.repeat(1024)]) {
    const boundaryHash = await object.hashPassword(boundary);
    const segments = boundaryHash.split(':');
    assert.equal(segments[5], scryptSync(boundary, segments[4], 32, options).toString('hex'));
  }
  await assert.rejects(object.fetch('https://unused.invalid/'), /fetch|handler|implement/i, 'KDF must not expose an HTTP handler');
  assert.equal((await mf.dispatchFetch('http://localhost/')).status, 404);
  console.log(`PASS Private SQLite Durable Object preserves scrypt N=32768/r=8/p=3, Node compatibility, random salts, strict bounds, and per-call object distribution (local first verification ${elapsed} ms).`);
} finally {
  await mf.dispose();
}
