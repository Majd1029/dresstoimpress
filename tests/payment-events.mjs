// Exercises the real webhook handler and migrations with isolated SQLite and a fake Stripe transport.
// No network requests, credentials, customer data, or existing database are used.
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createHmac,randomUUID} from 'node:crypto';
import * as crypto from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';
import assert from 'node:assert/strict';
import * as moneyTypes from '../lib/types.ts';

assert.equal(moneyTypes.money(98125,'TND').replace(/\s/g,''),'TND98.125');
assert.equal(moneyTypes.money(9800,'USD'),'$98.00');
assert.equal(moneyTypes.currencyFactor('TND'),1000);

const sql=new DatabaseSync(':memory:');
for(const file of ['0000_futuristic_silk_fever.sql','0001_silky_mastermind.sql'])sql.exec(readFileSync(new URL('../drizzle/'+file,import.meta.url),'utf8'));
sql.exec("INSERT INTO sessions(id,token_hash,csrf,expires) VALUES('session','hash','csrf',9999999999999)");
sql.exec("INSERT INTO carts(id,session_id) VALUES('cart','session')");
const config={STRIPE_SECRET_KEY:'sk_test_fixture',STRIPE_WEBHOOK_SECRET:'whsec_fixture'};
const transport=new Map();
const execute=(query,args=[])=>sql.prepare(query).run(...args);
const db={
 config:key=>config[key]||'', uid:()=>randomUUID(),
 one:async(query,...args)=>sql.prepare(query).get(...args),
 all:async(query,...args)=>sql.prepare(query).all(...args),
 run:async(query,...args)=>execute(query,args),
 stmt:(query,...args)=>({query,args}),
 db:()=>({batch:async statements=>{sql.exec('BEGIN');try{for(const s of statements)execute(s.query,s.args);sql.exec('COMMIT')}catch(error){sql.exec('ROLLBACK');throw error}}}),
};
class AppError extends Error {constructor(message,status=400){super(message);this.status=status}}
const module={exports:{}};
const code=ts.transpileModule(readFileSync(new URL('../lib/commerce.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const factory=vm.runInNewContext('(function(require,module,exports){'+code+'\n})',{
 Buffer,URLSearchParams,Date,console,
 fetch:async url=>{assert.ok(transport.has(url),'Unexpected Stripe request: '+url);return {ok:true,json:async()=>transport.get(url)}},
});
factory(name=>{
 if(name==='server-only')return {};
 if(name==='./types')return moneyTypes;
 if(name==='node:crypto')return crypto;
 if(name==='./db')return db;
 if(name==='./auth')return {AppError,sendPendingEmails:async()=>{}};
 if(name==='./validation')return {};
 throw new Error('Unexpected dependency '+name);
},module,module.exports);

await assert.rejects(module.exports.startCheckout({id:'session',user_id:null},{}),error=>error.status===401);
assert.equal(sql.prepare('SELECT count(*) count FROM checkout_attempts').get().count,0);
console.log('PASS Guest checkout is rejected before creating a checkout attempt');

function attempt(id,{amount=1000,payment='paid',stripeId=true}={}){
 sql.prepare("INSERT INTO checkout_attempts(id,request_key,session_id,email,name,address,subtotal,shipping,tax,total,currency,demo,expires,stripe_id) VALUES(?,?,'session','qa@example.test','QA','{}',1000,0,0,1000,'USD',0,9999999999,?)").run(id,id,stripeId?'cs_'+id:null);
 const session={id:'cs_'+id,metadata:{attempt_id:id},mode:'payment',livemode:false,currency:'usd',amount_total:amount,payment_status:payment,status:'complete'};
 transport.set('https://api.stripe.com/v1/charges/ch_'+id,{refunded:true,amount_refunded:1000,amount:1000,payment_intent:'pi_'+id});
 transport.set('https://api.stripe.com/v1/checkout/sessions?payment_intent=pi_'+id,{data:[session]});
 transport.set('https://api.stripe.com/v1/checkout/sessions/cs_'+id,session);
}
async function event(id,type,objectId){
 const raw=JSON.stringify({id,type,data:{object:{id:objectId}}}),time=String(Math.floor(Date.now()/1000));
 const signature=createHmac('sha256',config.STRIPE_WEBHOOK_SECRET).update(time+'.'+raw).digest('hex');
 await module.exports.webhook(new Request('http://localhost/api/stripe/webhook',{method:'POST',body:raw,headers:{'stripe-signature':'t='+time+',v1='+signature}}));
}
attempt('early',{stripeId:false});
await event('evt_refund','charge.refunded','ch_early');
assert.equal(sql.prepare("SELECT payment_status FROM orders WHERE attempt_id='early'").get().payment_status,'refunded');
await event('evt_complete','checkout.session.completed','cs_early');
await event('evt_refund','charge.refunded','ch_early');
assert.equal(sql.prepare("SELECT payment_status FROM orders WHERE attempt_id='early'").get().payment_status,'refunded');
assert.equal(sql.prepare('SELECT count(*) count FROM orders').get().count,1);
console.log('PASS Refund before completion creates one refunded order; completion and replay preserve it');

attempt('mismatch',{amount:2000});
await assert.rejects(event('evt_mismatch','charge.refunded','ch_mismatch'),/amount mismatch/);
assert.equal(sql.prepare("SELECT count(*) count FROM stripe_events WHERE id='evt_mismatch'").get().count,0);
assert.equal(sql.prepare("SELECT count(*) count FROM orders WHERE attempt_id='mismatch'").get().count,0);
console.log('PASS Amount mismatch rejects refund event without accepting it');

attempt('unpaid',{payment:'unpaid'});
await assert.rejects(event('evt_unpaid','charge.refunded','ch_unpaid'),/awaiting its paid checkout/);
assert.equal(sql.prepare("SELECT count(*) count FROM stripe_events WHERE id='evt_unpaid'").get().count,0);
console.log('PASS Unconfirmed payment defers refund processing for provider retry');
sql.close();
