import assert from 'node:assert/strict';
import {previewGate} from '../lib/preview-gate.ts';

const request = headers => new Request('https://store.personal.workers.dev/admin', {headers});
assert.equal((await previewGate(request(), {})).status, 503);
const env = {PREVIEW_ACCESS_PASSWORD: 'a'.repeat(64)};
assert.equal((await previewGate(request(), env)).status, 401);
assert.equal((await previewGate(request({Authorization: 'Basic ' + btoa('owner:wrong')}), env)).status, 401);
assert.equal(await previewGate(request({Authorization: 'Basic ' + btoa('owner:' + env.PREVIEW_ACCESS_PASSWORD)}), env), null);
assert.equal((await previewGate(new Request('https://localhost/admin'), {})).status, 503);
assert.equal(await previewGate(new Request('http://localhost:5173/'), {}), null);
assert.equal(await previewGate(request(), {SITE_VISIBILITY: 'public'}), null);
console.log('PASS Personal preview fails closed and requires the correct secret; public access is explicit.');
