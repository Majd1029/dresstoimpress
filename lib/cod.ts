import 'server-only';
import {one,stmt,db,uid} from './db';
import {AppError,sendPendingEmails} from './auth';
import {money} from './types';

export async function confirmCod(attemptId:string){
 const a=await one('SELECT * FROM checkout_attempts WHERE id=?',attemptId);
 if(!a||a.payment_method!=='cod'||!['reserved','cod_confirmed'].includes(a.status))throw new AppError('This cash-on-delivery checkout is no longer available.',409);
 const id='DTI-'+a.id;
 const body=(a.demo?'TEST CASH-ON-DELIVERY ORDER — no delivery or payment is due.':'Your cash-on-delivery order has been received. Pay '+money(a.total,a.currency)+' when it arrives.')+'\nOrder: '+id+'\nShipping address: '+a.address;
 await db().batch([
  stmt("UPDATE checkout_attempts SET status='cod_confirmed' WHERE id=? AND status='reserved' AND payment_method='cod'",a.id),
  stmt("INSERT OR IGNORE INTO orders (id,attempt_id,user_id,session_id,email,name,address,subtotal,shipping,tax,total,currency,status,payment_status,payment_method,demo) SELECT ?,id,user_id,session_id,email,name,address,subtotal,shipping,tax,total,currency,'pending',?,'cod',demo FROM checkout_attempts WHERE id=? AND status='cod_confirmed'",id,a.demo?'demo_cod_pending':'cod_pending',a.id),
  stmt('INSERT OR IGNORE INTO order_items (id,order_id,quantity,price,snapshot) SELECT id,?,quantity,price,snapshot FROM checkout_items WHERE attempt_id=? AND EXISTS(SELECT 1 FROM orders WHERE id=?)',id,a.id,id),
  stmt("INSERT OR IGNORE INTO email_outbox (id,dedupe_key,recipient,subject,body) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM orders WHERE id=?)",uid(),'order:'+id,a.email,a.demo?'Your test COD order':'Your cash-on-delivery order',body,id),
 ]);
 if(!await one('SELECT id FROM orders WHERE id=?',id))throw new AppError('This checkout expired. Please try again.',409);
 await sendPendingEmails();return id;
}

export async function collectCod(id:string){
 const order=await one('SELECT * FROM orders WHERE id=?',id);
 if(!order||order.payment_method!=='cod')throw new AppError('Cash-on-delivery order not found.',404);
 if(!['shipped','delivered'].includes(order.status))throw new AppError('Record collection after the order has been shipped or delivered.',409);
 await db().batch([stmt("UPDATE orders SET payment_status=CASE WHEN demo=1 THEN 'demo_cod_paid' ELSE 'paid' END,updated_at=CURRENT_TIMESTAMP WHERE id=? AND payment_method='cod' AND status IN ('shipped','delivered') AND payment_status IN ('cod_pending','demo_cod_pending')",id)]);
 return {ok:true};
}
