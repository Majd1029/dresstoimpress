import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {deploymentSql} from '../build/migration-sql.ts';

const db=new DatabaseSync(':memory:');
for(const filename of ['0000_futuristic_silk_fever.sql','0001_silky_mastermind.sql']){
 const source=readFileSync(new URL('../drizzle/'+filename,import.meta.url),'utf8');
 const sql=deploymentSql(source,filename);
 assert.ok(!sql.includes('\r'));
 db.exec(sql);
}
assert.equal(db.prepare("SELECT count(*) n FROM sqlite_master WHERE type='trigger'").get().n,5);
db.exec("INSERT INTO sessions(id,token_hash,csrf,expires) VALUES('s','h','c',9999999999999); INSERT INTO carts(id,session_id) VALUES('c','s'); INSERT INTO products(id,name,slug,description,price,sku,published) VALUES('p','Product','product','QA',1000,'SKU',1); INSERT INTO product_variants(id,product_id,size,color) VALUES('v','p','M','Black'); INSERT INTO inventory(variant_id,stock) VALUES('v',1); INSERT INTO cart_items(id,cart_id,variant_id,quantity) VALUES('item','c','v',3)");
function attempt(id){db.prepare("INSERT INTO checkout_attempts(id,request_key,session_id,email,name,address,subtotal,shipping,tax,total,currency,demo,expires) VALUES(?,?,'s','qa@example.test','QA','{}',1000,0,0,1000,'USD',1,9999999999)").run(id,id)}
function item(id){db.prepare("INSERT INTO checkout_items(id,attempt_id,variant_id,quantity,price,snapshot) VALUES(?,?,'v',1,1000,'{}')").run('item-'+id,id)}
attempt('a');item('a');
assert.equal(db.prepare("SELECT stock FROM inventory WHERE variant_id='v'").get().stock,0);
attempt('b');assert.throws(()=>item('b'),/Stock or price changed/);
db.exec("UPDATE checkout_attempts SET status='released' WHERE id='a'");
db.exec("UPDATE checkout_attempts SET status='released' WHERE id='a'");
assert.equal(db.prepare("SELECT stock FROM inventory WHERE variant_id='v'").get().stock,1);
item('b');db.exec("UPDATE checkout_attempts SET status='paid' WHERE id='b'");
db.exec("UPDATE checkout_attempts SET status='paid' WHERE id='b'");
assert.equal(db.prepare("SELECT quantity FROM cart_items WHERE id='item'").get().quantity,2);
assert.equal(db.prepare("SELECT stock FROM inventory WHERE variant_id='v'").get().stock,0);
console.log('PASS Packaged migrations install all five triggers and preserve atomic stock, release, and cart behavior');
db.close();
