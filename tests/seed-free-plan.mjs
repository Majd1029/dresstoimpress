import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import ts from 'typescript';

const sql = new DatabaseSync(':memory:');
for (const filename of ['0000_futuristic_silk_fever.sql', '0001_silky_mastermind.sql']) {
  sql.exec(readFileSync(new URL('../drizzle/' + filename, import.meta.url), 'utf8'));
}
let queries = 0;
function prepare(query, args = []) {
  return {bind: (...values) => prepare(query, values), first: async () => {queries++; return sql.prepare(query).get(...args);},
    all: async () => {queries++; return {results: sql.prepare(query).all(...args)};}, query, args};
}
const env = {DB: {prepare, batch: async statements => {
  sql.exec('BEGIN');
  try { for (const statement of statements) { queries++; sql.prepare(statement.query).run(...statement.args); } sql.exec('COMMIT'); }
  catch (error) { sql.exec('ROLLBACK'); throw error; }
}}};
function load(file, dependencies) {
  const module = {exports: {}};
  const code = ts.transpileModule(readFileSync(new URL('../' + file, import.meta.url), 'utf8'), {
    compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
  }).outputText;
  const run = vm.runInNewContext('(function(require,module,exports){' + code + '\n})', {process, console, crypto});
  run(name => {if (!(name in dependencies)) throw new Error('Unexpected dependency ' + name); return dependencies[name];}, module, module.exports);
  return module.exports;
}
const brand = load('lib/brand.ts', {});
const store = load('lib/db.ts', {'server-only': {}, 'cloudflare:workers': {env}, './brand': brand});
await store.getStore();
assert.ok(queries <= 50, `Fresh page exceeded Free D1 allowance: ${queries}`);
assert.equal(sql.prepare('SELECT count(*) n FROM products').get().n, 8);
assert.equal(sql.prepare('SELECT count(*) n FROM product_variants').get().n, 40);
assert.equal(sql.prepare('SELECT count(*) n FROM product_images').get().n, 16);
assert.equal(sql.prepare("SELECT stock FROM inventory WHERE variant_id='demo-8-M'").get().stock, 0);
assert.equal(sql.prepare("SELECT stock FROM inventory WHERE variant_id='demo-1-XL'").get().stock, 2);
sql.exec("UPDATE inventory SET stock=37 WHERE variant_id='demo-1-M'");
await store.seedDemo();
assert.equal(sql.prepare("SELECT stock FROM inventory WHERE variant_id='demo-1-M'").get().stock, 37);
assert.equal(sql.prepare('SELECT count(*) n FROM products').get().n, 8);
console.log('PASS Fresh catalog fits Free D1 query limits, preserves 8 products/40 variants, and never reseeds existing stock.');
sql.close();
