import 'server-only';
import {createHmac,timingSafeEqual} from 'node:crypto';
import {all,one,run,stmt,db,uid,config,getStore} from './db';
import {AppError,sendPendingEmails} from './auth';
import {addressSchema} from './validation';
export async function getCart(sessionId:string){return all(`SELECT ci.id,ci.variant_id variantId,ci.quantity,v.product_id productId,v.size,v.color,p.name,p.slug,COALESCE(p.sale_price,p.price) price,p.published,p.demo,i.stock,(SELECT url FROM product_images WHERE product_id=p.id ORDER BY position LIMIT 1) image FROM cart_items ci JOIN carts c ON c.id=ci.cart_id JOIN product_variants v ON v.id=ci.variant_id JOIN products p ON p.id=v.product_id JOIN inventory i ON i.variant_id=v.id WHERE c.session_id=? ORDER BY ci.id`,sessionId)}
export async function changeCart(sessionId:string,variantId:string,quantity:number,add=false){
 const cart=await one('SELECT id FROM carts WHERE session_id=?',sessionId);if(!cart)throw new AppError('Your bag could not be loaded. Refresh and try again.');
 if(!Number.isInteger(quantity)||quantity<0||quantity>20)throw new AppError('Choose a quantity between 1 and 20.');
 const v=await one('SELECT i.stock,p.published FROM product_variants v JOIN inventory i ON i.variant_id=v.id JOIN products p ON p.id=v.product_id WHERE v.id=?',variantId);if(!v)throw new AppError('This item is no longer available.',404);
 const existing=await one('SELECT quantity FROM cart_items WHERE cart_id=? AND variant_id=?',cart.id,variantId);const qty=quantity+(add?(existing?.quantity??0):0);
 if(qty===0)await run('DELETE FROM cart_items WHERE cart_id=? AND variant_id=?',cart.id,variantId);
 else{if(!v.published||qty>v.stock||qty>20)throw new AppError('That quantity is unavailable. Please choose fewer items.');await run('INSERT INTO cart_items (id,cart_id,variant_id,quantity) VALUES (?,?,?,?) ON CONFLICT(cart_id,variant_id) DO UPDATE SET quantity=excluded.quantity',uid(),cart.id,variantId,qty)}
 return getCart(sessionId);
}
class StripeFailure extends AppError{constructor(public remoteStatus:number,public remoteCode:string){super('The payment service could not complete this request. Your bag is saved.',502)}}
async function stripe(path:string,form?:URLSearchParams,idempotency?:string){const key=config('STRIPE_SECRET_KEY');if(!key)throw new AppError('Secure payment is not configured yet.',503);const response=await fetch('https://api.stripe.com/v1/'+path,{method:form?'POST':'GET',headers:{Authorization:'Bearer '+key,...(form?{'Content-Type':'application/x-www-form-urlencoded'}:{}),...(idempotency?{'Idempotency-Key':idempotency}:{})},body:form});const data=await response.json() as any;if(!response.ok)throw new StripeFailure(response.status,data.error?.code||data.error?.type||'unknown');return data}
export async function confirmAttempt(attemptId:string,demo=false){
 const a=await one('SELECT * FROM checkout_attempts WHERE id=?',attemptId);if(!a||Boolean(a.demo)!==demo)throw new AppError('Payment could not be verified.',400);if(a.status==='released')throw new AppError('This checkout has expired.',409);
 const id='DTI-'+a.id,body=(demo?'DEMO ORDER — no payment taken and no shipment will be made.\n\n':'Thank you for your order.\n\n')+'Order: '+id+'\nTotal: '+(a.total/100).toFixed(2)+' '+a.currency+'\nShipping address: '+a.address;
 await db().batch([
 stmt("UPDATE checkout_attempts SET status='paid' WHERE id=? AND status='reserved'",a.id),
 stmt("INSERT OR IGNORE INTO orders (id,attempt_id,user_id,session_id,email,name,address,subtotal,shipping,tax,total,currency,status,payment_status,demo) SELECT ?,id,user_id,session_id,email,name,address,subtotal,shipping,tax,total,currency,'paid',?,demo FROM checkout_attempts WHERE id=? AND status='paid'",id,demo?'demo':'paid',a.id),
 stmt('INSERT OR IGNORE INTO order_items (id,order_id,quantity,price,snapshot) SELECT id,?,quantity,price,snapshot FROM checkout_items WHERE attempt_id=?',id,a.id),

 stmt("INSERT OR IGNORE INTO email_outbox (id,dedupe_key,recipient,subject,body) VALUES (?,?,?,?,?)",uid(),'order:'+id,a.email,demo?'Your demo order confirmation':'Your Dress to Impress order',body)
 ]);
 await sendPendingEmails();return id;
}
export async function startCheckout(s:any,body:any){
 if(!s?.user_id)throw new AppError('Create an account or sign in before placing an order.',401);
 const address=addressSchema.parse(body.address);if(typeof body.requestKey!=='string'||body.requestKey.length<16||body.requestKey.length>100)throw new AppError('Please refresh checkout and try again.');
 const store=await getStore();const live=store.settings.liveSales;if(!live&&body.confirmDemo!==true)throw new AppError('Please acknowledge that this is a demo checkout.');const existing=await one('SELECT * FROM checkout_attempts WHERE session_id=? AND request_key=?',s.id,body.requestKey);
 let a=existing;
 if(existing&&existing.user_id&&existing.user_id!==s.user_id)throw new AppError('Checkout not found.',404);
 if(existing){if(existing.status==='paid'){const order=await one('SELECT id FROM orders WHERE attempt_id=?',existing.id);return {url:'/order/'+order.id}}if(existing.status!=='reserved')throw new AppError('This checkout expired. Return to your bag and start again.');if(existing.address!==JSON.stringify(address))throw new AppError('Your checkout details changed. Return to your bag and start again.')}
 if(!a){
 const lines=await getCart(s.id);if(!lines.length)throw new AppError('Your bag is empty.');if(lines.length>30)throw new AppError('Please keep your bag to 30 items or fewer.');
 if(lines.some(l=>!l.published||l.quantity>l.stock))throw new AppError('An item in your bag is no longer available in that quantity.');
 if(live&&lines.some(l=>l.demo))throw new AppError('Demo products cannot be purchased. Please remove them from your bag.');
 if(live&&(!config('STRIPE_SECRET_KEY')||!config('STRIPE_WEBHOOK_SECRET')))throw new AppError('Secure payments are not ready yet. Please try again later.',503);
 const countries=store.settings.shippingCountries.split(',').map(x=>x.trim()).filter(Boolean);if(live&&(!countries.length||!countries.includes(address.country)))throw new AppError('Shipping to this country is not available.');
 const subtotal=lines.reduce((n,l)=>n+l.quantity*l.price,0),shipping=store.settings.shippingFee,tax=Math.round((subtotal+shipping)*store.settings.taxRate/100),id=uid(),expires=Math.floor(Date.now()/1000)+2100;
 try{await db().batch([stmt('INSERT INTO checkout_attempts (id,request_key,session_id,user_id,email,name,address,subtotal,shipping,tax,total,currency,demo,expires) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)',id,body.requestKey,s.id,s.user_id??null,address.email,address.name,JSON.stringify(address),subtotal,shipping,tax,subtotal+shipping+tax,store.settings.currency,live?0:1,expires),...lines.map(l=>stmt('INSERT INTO checkout_items (id,attempt_id,variant_id,quantity,price,snapshot) VALUES (?,?,?,?,?,?)',uid(),id,l.variantId,l.quantity,l.price,JSON.stringify({name:l.name,size:l.size,color:l.color,image:l.image,slug:l.slug})))]);}catch(error){console.error('Stock reservation failed');throw new AppError('Stock changed while you were checking out. Refresh your bag and try again.',409)}
 a=await one('SELECT * FROM checkout_attempts WHERE id=?',id);
 }
 if(a.demo){if(body.confirmDemo!==true)throw new AppError('Please acknowledge that this is a demo checkout.');const orderId=await confirmAttempt(a.id,true);return{url:'/order/'+orderId}}
 if(a.stripe_url)return {url:a.stripe_url};
 if(Math.floor(Date.now()/1000)>a.expires+22*3600)throw new AppError('This checkout needs owner review. A second payment session will not be created.',409);
 const items=await all('SELECT * FROM checkout_items WHERE attempt_id=?',a.id);const origin=config('APP_URL')||'http://localhost:5173';let form=new URLSearchParams({mode:'payment','payment_method_types[0]':'card',success_url:origin+'/checkout/success?session_id={CHECKOUT_SESSION_ID}',cancel_url:origin+'/checkout?cancelled=1',customer_email:a.email,'metadata[attempt_id]':a.id,client_reference_id:a.id,expires_at:String(a.expires)});
 const priced=items.map(i=>({name:JSON.parse(i.snapshot).name,amount:i.price,qty:i.quantity}));if(a.shipping)priced.push({name:'Shipping',amount:a.shipping,qty:1});if(a.tax)priced.push({name:'Configured tax',amount:a.tax,qty:1});
 priced.forEach((line,i)=>{form.set('line_items['+i+'][price_data][currency]',a.currency.toLowerCase());form.set('line_items['+i+'][price_data][product_data][name]',line.name);form.set('line_items['+i+'][price_data][unit_amount]',String(line.amount));form.set('line_items['+i+'][quantity]',String(line.qty));});
 if(a.stripe_params)form=new URLSearchParams(a.stripe_params);else await run('UPDATE checkout_attempts SET stripe_params=? WHERE id=? AND stripe_params IS NULL',form.toString(),a.id);
 let session:any;try{session=await stripe('checkout/sessions',form,'dti-checkout-'+a.id)}catch(e){if(e instanceof StripeFailure&&e.remoteStatus===400&&e.remoteCode!=='idempotency_key_in_use')await run("UPDATE checkout_attempts SET status='released' WHERE id=? AND status='reserved'",a.id);throw e}await run('UPDATE checkout_attempts SET stripe_id=?,stripe_url=? WHERE id=?',session.id,session.url,a.id);return{url:session.url};
}
async function reconcileSession(remote:any){const a=await one('SELECT * FROM checkout_attempts WHERE id=?',remote.metadata?.attempt_id??'');if(!a||a.demo||remote.mode!=='payment'||(a.stripe_id&&a.stripe_id!==remote.id))throw new AppError('Unrecognized payment session.');
 if(remote.currency!==a.currency.toLowerCase()||remote.amount_total!==a.total)throw new AppError('Payment amount mismatch.');
 const liveKey=config('STRIPE_SECRET_KEY').startsWith('sk_live_');if(Boolean(remote.livemode)!==liveKey)throw new AppError('Payment environment mismatch.');
 if(!a.stripe_id)await run('UPDATE checkout_attempts SET stripe_id=? WHERE id=?',remote.id,a.id);
 if(remote.payment_status==='paid')return confirmAttempt(a.id,false);
 if(remote.status==='expired')await run("UPDATE checkout_attempts SET status='released' WHERE id=? AND status='reserved'",a.id);
 return null;
}
export async function paymentStatus(stripeId:string,s:any){const a=await one('SELECT * FROM checkout_attempts WHERE stripe_id=? AND ((user_id IS NULL AND session_id=?) OR user_id=?)',stripeId,s.id,s.user_id??'');if(!a)throw new AppError('Checkout not found.',404);const existing=await one('SELECT id FROM orders WHERE attempt_id=?',a.id);if(existing)return{orderId:existing.id};return {orderId:await reconcileSession(await stripe('checkout/sessions/'+encodeURIComponent(stripeId)))}}
export async function webhook(req:Request){const raw=await req.text(),sig=req.headers.get('stripe-signature')??'',secret=config('STRIPE_WEBHOOK_SECRET');const parts=sig.split(','),time=parts.find(p=>p.startsWith('t='))?.slice(2);if(!secret||!time||Math.abs(Date.now()/1000-Number(time))>300)throw new AppError('Invalid signature.',400);const expected=createHmac('sha256',secret).update(time+'.'+raw).digest();const valid=parts.filter(p=>p.startsWith('v1=')).some(p=>{const given=Buffer.from(p.slice(3),'hex');return given.length===expected.length&&timingSafeEqual(given,expected)});if(!valid)throw new AppError('Invalid signature.',400);const event=JSON.parse(raw);if(await one('SELECT id FROM stripe_events WHERE id=?',event.id))return;
 if(['checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.expired'].includes(event.type)){const remote=await stripe('checkout/sessions/'+encodeURIComponent(event.data.object.id));await reconcileSession(remote)}
 if(event.type==='charge.refunded'){
  const charge=await stripe('charges/'+encodeURIComponent(event.data.object.id));
  if(charge.refunded&&charge.amount_refunded===charge.amount){
   const sessions=await stripe('checkout/sessions?payment_intent='+encodeURIComponent(charge.payment_intent));
   for(const session of sessions.data){
    const a=await one('SELECT id FROM checkout_attempts WHERE stripe_id=? OR id=?',session.id,session.metadata?.attempt_id??'');
    if(a){
     // Refund events may arrive before the checkout completion webhook.
     const orderId=await reconcileSession(session);
     if(!orderId)throw new AppError('Refund confirmation is awaiting its paid checkout.',409);
     await run("UPDATE orders SET status='refunded',payment_status='refunded',updated_at=CURRENT_TIMESTAMP WHERE attempt_id=? AND demo=0",a.id);
    }
   }
  }
 }
 await run('INSERT OR IGNORE INTO stripe_events (id) VALUES (?)',event.id);
}
export async function reconcileExpired(){const attempts=await all("SELECT * FROM checkout_attempts WHERE status='reserved' AND expires<? LIMIT 20",Math.floor(Date.now()/1000));for(const a of attempts){if(a.demo){await run("UPDATE checkout_attempts SET status='released' WHERE id=? AND status='reserved'",a.id);continue}if(!a.stripe_id){if(!a.stripe_params){await run("UPDATE checkout_attempts SET status='released' WHERE id=? AND status='reserved'",a.id);continue}if(Math.floor(Date.now()/1000)>a.expires+22*3600){let after='',found:any=null,complete=false;for(let page=0;page<10;page++){const query=new URLSearchParams({limit:'100','created[gte]':String(a.expires-2105),'created[lte]':String(a.expires),...(after?{starting_after:after}:{})});const list=await stripe('checkout/sessions?'+query.toString());found=list.data.find((x:any)=>x.metadata?.attempt_id===a.id);if(found||!list.has_more){complete=true;break}after=list.data[list.data.length-1].id}if(found){await run('UPDATE checkout_attempts SET stripe_id=? WHERE id=?',found.id,a.id);await reconcileSession(found)}else if(complete){await run("UPDATE checkout_attempts SET status='released' WHERE id=? AND status='reserved'",a.id)}continue;}try{const recovered=await stripe('checkout/sessions',new URLSearchParams(a.stripe_params),'dti-checkout-'+a.id);await run('UPDATE checkout_attempts SET stripe_id=?,stripe_url=? WHERE id=?',recovered.id,recovered.url,a.id);a.stripe_id=recovered.id}catch(e){if(e instanceof StripeFailure&&e.remoteStatus===400&&e.remoteCode!=='idempotency_key_in_use'){await run("UPDATE checkout_attempts SET status='released' WHERE id=? AND status='reserved'",a.id);continue}throw e}}const remote=await stripe('checkout/sessions/'+encodeURIComponent(a.stripe_id));if(remote.status==='open')await reconcileSession(await stripe('checkout/sessions/'+encodeURIComponent(a.stripe_id)+'/expire',new URLSearchParams()));else await reconcileSession(remote)}return {checked:attempts.length}}
export async function getOrder(id:string,s:any){const order=await one('SELECT * FROM orders WHERE id=? AND ((user_id IS NULL AND session_id=?) OR user_id=? OR ?=1)',id,s.id,s.user_id??'',s.role==='admin'?1:0);if(!order)throw new AppError('Order not found.',404);return {...order,address:JSON.parse(order.address),items:(await all('SELECT * FROM order_items WHERE order_id=?',id)).map(i=>({...i,...JSON.parse(i.snapshot)}))}}


export async function refundOrder(id:string){const order=await one('SELECT o.*,a.stripe_id FROM orders o JOIN checkout_attempts a ON a.id=o.attempt_id WHERE o.id=?',id);if(!order)throw new AppError('Order not found.',404);if(order.demo){await run("UPDATE orders SET status='refunded',payment_status='demo-refunded',updated_at=CURRENT_TIMESTAMP WHERE id=?",id);return}const session=await stripe('checkout/sessions/'+encodeURIComponent(order.stripe_id));if(!session.payment_intent||session.amount_total!==order.total)throw new AppError('Payment could not be verified for refund.');const result=await stripe('refunds',new URLSearchParams({payment_intent:session.payment_intent,amount:String(order.total),reason:'requested_by_customer'}),'dti-refund-'+id);if(result.status==='succeeded')await run("UPDATE orders SET status='refunded',payment_status='refunded',updated_at=CURRENT_TIMESTAMP WHERE id=?",id);else{await run("UPDATE orders SET payment_status='refund-pending',updated_at=CURRENT_TIMESTAMP WHERE id=?",id);throw new AppError('Stripe is processing the refund. The order will update when confirmation arrives.',409)}}
