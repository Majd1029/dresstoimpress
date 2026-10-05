// Real SQLite migrations + production media code; no credentials or remote services.
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync, mkdtempSync, readdirSync, unlinkSync, rmdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Worker, isMainThread, parentPort, workerData} from 'node:worker_threads';
import vm from 'node:vm';
import ts from 'typescript';

const module = {exports: {}};
const code = ts.transpileModule(readFileSync(new URL('../lib/media.ts', import.meta.url), 'utf8'), {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
}).outputText;
vm.runInNewContext('(function(module,exports){' + code + '\n})', {
  crypto, Uint8Array, ArrayBuffer, TextEncoder, Headers, Date, Error,
})(module, module.exports);
const media = module.exports;
const {putMedia, getMedia, mediaHeaders, MEDIA_CHUNK_BYTES: chunkSize, MEDIA_UPLOAD_MAX_BYTES: uploadMax,
  MEDIA_IMPORT_MAX_BYTES: importMax, MEDIA_BUDGET_BYTES: budget} = media;

function setup(database) {
  database.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000');
  for (const file of readdirSync(new URL('../drizzle/', import.meta.url)).filter(name => name.endsWith('.sql')).sort())
    database.exec(readFileSync(new URL('../drizzle/' + file, import.meta.url), 'utf8'));
}
function adapter(sql) {
  const stats = {queries: 0, batches: [], maxParameters: 0, maxSqlBytes: 0, failAt: -1};
  function prepare(query, values = []) {
    return {query, values, bind: (...values) => prepare(query, values), first: async () => {
      inspect(query, values);
      return sql.prepare(query).get(...convert(values)) ?? null;
    }};
  }
  function convert(values) { return values.map(value => value instanceof ArrayBuffer ? Buffer.from(value) : value); }
  function inspect(query, values) {
    stats.queries++;
    stats.maxParameters = Math.max(stats.maxParameters, values.length);
    stats.maxSqlBytes = Math.max(stats.maxSqlBytes, Buffer.byteLength(query));
    assert.ok(values.length <= 100, 'D1 query exceeds 100 parameters');
    assert.ok(Buffer.byteLength(query) <= 100000, 'D1 SQL exceeds 100 KB');
    for (const value of values) if (value instanceof ArrayBuffer) assert.ok(value.byteLength < 2000000, 'D1 BLOB exceeds row limit');
  }
  const database = {prepare, batch: async statements => {
    stats.batches.push(statements.length);
    sql.exec('BEGIN IMMEDIATE');
    try {
      const results = statements.map(({query, values}, index) => {
        inspect(query, values);
        if (index === stats.failAt) { stats.failAt = -1; throw new Error('Injected later-chunk failure'); }
        const rows = sql.prepare(query).all(...convert(values));
        // D1's JSON transport returns BLOB values as number arrays.
        return {success: true, results: rows.map(row => Object.fromEntries(Object.entries(row)
          .map(([key, value]) => [key, value instanceof Uint8Array ? Array.from(value) : value])))};
      });
      sql.exec('COMMIT');
      return results;
    } catch (error) { sql.exec('ROLLBACK'); throw error; }
  }};
  return {database, stats};
}

if (!isMainThread) {
  const sql = new DatabaseSync(workerData.filename);
  sql.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000');
  const {database} = adapter(sql);
  const barrier = new Int32Array(workerData.barrier);
  parentPort.postMessage({ready: true});
  Atomics.wait(barrier, 0, 0);
  try {
    await putMedia(database, workerData.key, new Uint8Array(uploadMax));
    parentPort.postMessage({success: true});
  } catch (error) { parentPort.postMessage({success: false, status: error.status, message: error.message}); }
  finally { sql.close(); }
} else {
  const sql = new DatabaseSync(':memory:');
  setup(sql);
  const {database, stats} = adapter(sql);
  const used = () => sql.prepare('SELECT used_bytes FROM media_storage WHERE id=1').get().used_bytes;
  const accounting = () => assert.equal(used(), sql.prepare('SELECT coalesce(sum(storage_bytes),0) n FROM media_objects').get().n);
  const erase = key => sql.prepare('DELETE FROM media_objects WHERE key=?').run(key);
  const sourceOptions = {httpMetadata: {contentType: 'image/png', contentLanguage: 'tr',
    contentDisposition: 'inline; filename="original.png"', cacheControl: 'public,max-age=86400',
    cacheExpiry: new Date('2027-01-01T00:00:00Z')}, customMetadata: {originalName: 'élbise.png', orphan: 'yes'},
    import: {uploaded: new Date('2026-01-02T03:04:05Z'), etag: 'original-r2-etag', duplicate: 'verify'}};
  const original = Uint8Array.from({length: chunkSize + 7}, (_, index) => index % 251);
  const first = await putMedia(database, 'unreferenced/original.png', original, sourceOptions);
  assert.equal(first.alreadyPresent, false);
  const file = await getMedia(database, first.key);
  assert.deepEqual(file.body, original);
  assert.equal(file.sourceEtag, 'original-r2-etag');
  assert.equal(file.uploaded.toISOString(), '2026-01-02T03:04:05.000Z');
  assert.equal(file.httpMetadata.cacheExpiry, '2027-01-01T00:00:00.000Z');
  assert.equal(JSON.stringify(file.customMetadata), '{"originalName":"élbise.png","orphan":"yes"}');
  assert.equal(sql.prepare('SELECT count(*) n FROM product_images').get().n, 0, 'Orphan source object must not require a product');
  assert.equal(mediaHeaders(file).get('Content-Type'), 'image/png');
  assert.equal(mediaHeaders(file).get('Cache-Control'), 'public,max-age=86400');
  assert.equal(mediaHeaders(file).get('ETag'), '"' + file.etag + '"');
  assert.equal(await getMedia(database, 'missing'), null);
  accounting();
  console.log('PASS Exact original bytes, nested orphan keys, HTTP/custom metadata, dates and cache headers round-trip.');

  const beforeDuplicate = used();
  await assert.rejects(putMedia(database, first.key, original), error => error.status === 409);
  const same = {...sourceOptions, customMetadata: {orphan: 'yes', originalName: 'élbise.png'}};
  assert.equal((await putMedia(database, first.key, original, same)).alreadyPresent, true);
  await assert.rejects(putMedia(database, first.key, original, {...same, customMetadata: {changed: 'metadata'}}), error => error.status === 409);
  const different = original.slice(); different[0] ^= 255;
  await assert.rejects(putMedia(database, first.key, different, same), error => error.status === 409);
  assert.equal(used(), beforeDuplicate);
  assert.deepEqual((await getMedia(database, first.key)).body, original);
  accounting();
  console.log('PASS Duplicate uploads never overwrite; import retries verify bytes and normalized metadata without reserving twice.');

  for (const size of [1, chunkSize - 1, chunkSize, chunkSize + 1, uploadMax]) {
    const bytes = new Uint8Array(size).fill(size % 255), key = 'boundary-' + size;
    const before = stats.queries;
    await putMedia(database, key, bytes);
    assert.equal(stats.queries - before, 2);
    assert.deepEqual((await getMedia(database, key)).body, bytes);
    erase(key);
  }
  await assert.rejects(putMedia(database, 'too-large', new Uint8Array(uploadMax + 1)), error => error.status === 413);
  await assert.rejects(putMedia(database, 'empty-upload', new Uint8Array()), error => error.status === 413);
  const beforeLarge = stats.queries;
  const large = new Uint8Array(importMax).fill(123);
  await putMedia(database, 'original-5mb', large, {import: {}});
  assert.equal(stats.queries - beforeLarge, 3);
  assert.equal(sql.prepare("SELECT count(*) n FROM media_chunks WHERE object_key='original-5mb'").get().n, 40);
  assert.deepEqual((await getMedia(database, 'original-5mb')).body, large);
  await assert.rejects(putMedia(database, 'import-too-large', new Uint8Array(importMax + 1), {import: {}}), error => error.status === 413);
  await putMedia(database, 'empty-original', new Uint8Array(), {import: {}});
  assert.equal((await getMedia(database, 'empty-original')).body.length, 0);
  const beforeEight = stats.queries;
  for (let i = 0; i < 8; i++) await putMedia(database, 'eight-' + i, new Uint8Array(uploadMax));
  assert.equal(stats.queries - beforeEight, 16, 'Eight uploads leave queries for authentication under Free limit of 50');
  accounting();
  console.log('PASS New uploads <=1 MiB, imports <=5 MiB (including empty originals); 8 uploads use 16 queries and a 5 MiB import uses 3.');

  const beforeFailure = used();
  stats.failAt = 2;
  await assert.rejects(putMedia(database, 'rollback', large, {import: {}}), /Injected later-chunk failure/);
  assert.equal(used(), beforeFailure);
  assert.equal(sql.prepare("SELECT count(*) n FROM media_objects WHERE key='rollback'").get().n, 0);
  assert.equal(sql.prepare("SELECT count(*) n FROM media_chunks WHERE object_key='rollback'").get().n, 0);
  const oldCharge = sql.prepare('SELECT storage_bytes FROM media_objects WHERE key=?').get(first.key).storage_bytes;
  erase(first.key); erase(first.key);
  assert.equal(used(), beforeFailure - oldCharge);
  assert.equal(sql.prepare('SELECT count(*) n FROM media_chunks WHERE object_key=?').get(first.key).n, 0);
  assert.throws(() => sql.exec("UPDATE media_objects SET byte_length=0 WHERE key='original-5mb'"), /immutable/);
  assert.throws(() => sql.exec("INSERT INTO media_chunks(object_key,position,data) VALUES('original-5mb',40,x'00')"), /Invalid media chunk/);
  accounting();
  console.log('PASS Later-chunk failure rolls back the entire batch; deleting one object releases its exact budget and chunks once.');

  await assert.rejects(putMedia(database, 'é'.repeat(513), new Uint8Array(1)), /1024 UTF-8/);
  await assert.rejects(putMedia(database, 'metadata-size', new Uint8Array(1), {customMetadata: {x: 'é'.repeat(17000)}}), /32 KiB/);
  await putMedia(database, 'é'.repeat(512), new Uint8Array(1), {customMetadata: {name: '原始'}});
  const unsafe = {...file, httpMetadata: {contentType: 'text/html', contentDisposition: 'inline', contentLanguage: 'en\r\nX-Injected: yes'}};
  assert.equal(mediaHeaders(unsafe).get('Content-Type'), 'application/octet-stream');
  assert.equal(mediaHeaders(unsafe).get('Content-Disposition'), 'attachment');
  assert.equal(mediaHeaders(unsafe).has('Content-Language'), false);
  sql.exec('DROP TRIGGER media_chunks_immutable');
  sql.prepare("UPDATE media_chunks SET data=? WHERE object_key='original-5mb' AND position=0").run(new Uint8Array(chunkSize));
  await assert.rejects(putMedia(database, 'original-5mb', large, {import: {duplicate: 'verify'}}), error => error.status === 409);
  sql.exec("DELETE FROM media_chunks WHERE object_key='original-5mb' AND position=0");
  await assert.rejects(getMedia(database, 'original-5mb'), error => error.status === 503);
  accounting();
  console.log('PASS UTF-8 bounds, safe content type/header handling, corrupted retry verification and missing-chunk detection.');
  sql.close();

  // Two actual SQLite connections race in separate workers. The counter fixture represents
  // earlier allocations, avoiding 100 MiB of fixture BLOBs; production reservation SQL is unchanged.
  const directory = mkdtempSync(join(tmpdir(), 'd1-media-test-'));
  const filename = join(directory, 'race.sqlite');
  const raceSql = new DatabaseSync(filename);
  try {
    setup(raceSql);
    raceSql.exec('PRAGMA journal_mode=WAL');
    const {database: raceDb} = adapter(raceSql);
    await putMedia(raceDb, 'race-a', new Uint8Array(uploadMax));
    const charge = raceSql.prepare("SELECT storage_bytes FROM media_objects WHERE key='race-a'").get().storage_bytes;
    raceSql.exec("DELETE FROM media_objects WHERE key='race-a'");
    const baseline = budget - charge;
    raceSql.prepare('UPDATE media_storage SET used_bytes=? WHERE id=1').run(baseline);
    const barrier = new SharedArrayBuffer(4);
    const started = [], finished = [];
    for (const key of ['race-a', 'race-b']) {
      const worker = new Worker(new URL(import.meta.url), {workerData: {filename, key, barrier}});
      let resolveStarted, resolveFinished, rejectFinished;
      started.push(new Promise(resolve => {resolveStarted = resolve;}));
      finished.push(new Promise((resolve, reject) => {resolveFinished = resolve; rejectFinished = reject;}));
      worker.on('message', message => message.ready ? resolveStarted() : resolveFinished(message));
      worker.on('error', error => {resolveStarted(); rejectFinished(error);});
    }
    await Promise.all(started);
    Atomics.store(new Int32Array(barrier), 0, 1);
    Atomics.notify(new Int32Array(barrier), 0, 2);
    const results = await Promise.all(finished);
    assert.equal(results.filter(result => result.success).length, 1);
    assert.equal(results.find(result => !result.success).status, 507);
    assert.equal(raceSql.prepare('SELECT used_bytes FROM media_storage WHERE id=1').get().used_bytes, budget);
    assert.equal(raceSql.prepare('SELECT count(*) n FROM media_objects').get().n, 1);
    assert.equal(raceSql.prepare('SELECT count(*) n FROM media_chunks').get().n, 8);
    const winner = raceSql.prepare('SELECT key FROM media_objects').get().key;
    assert.equal((await putMedia(raceDb, winner, new Uint8Array(uploadMax), {import: {duplicate: 'verify'}})).alreadyPresent, true);
    await assert.rejects(putMedia(raceDb, 'over-budget', new Uint8Array(1)), error => error.status === 507);
    raceSql.prepare('DELETE FROM media_objects WHERE key=?').run(winner);
    assert.equal(raceSql.prepare('SELECT used_bytes FROM media_storage WHERE id=1').get().used_bytes, baseline);
    console.log('PASS Concurrent transactions fill exactly 100 MiB: only one wins, the other leaves no partial data; full-budget retry remains idempotent.');
  } finally {
    raceSql.close();
    // Remove only files created in this fresh directory; never recurse or touch source data.
    for (const file of readdirSync(directory)) unlinkSync(join(directory, file));
    rmdirSync(directory);
  }
  assert.ok(stats.maxParameters <= 75);
  assert.ok(stats.maxSqlBytes < 1000);
  console.log(`PASS Free D1 SQL limits: max ${stats.maxParameters} parameters, max ${stats.maxSqlBytes} SQL bytes, no new dependencies.`);
}
