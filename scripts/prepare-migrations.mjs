import {mkdirSync, readFileSync, readdirSync, writeFileSync} from 'node:fs';
import {deploymentSql} from '../build/migration-sql.ts';

const source = new URL('../drizzle/', import.meta.url);
const output = new URL('../.migration/schema/', import.meta.url);
mkdirSync(output, {recursive: true});
const files = readdirSync(source).filter(file => file.endsWith('.sql')).sort();
for (const file of files) {
  writeFileSync(new URL(file, output), deploymentSql(readFileSync(new URL(file, source), 'utf8'), file));
}
console.log(`Prepared ${files.length} normalized migrations in .migration/schema. Source SQL is unchanged.`);
