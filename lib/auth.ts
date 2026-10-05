import 'server-only';
import {cookies} from 'next/headers';
import {randomBytes,createHash} from 'node:crypto';
import {env} from 'cloudflare:workers';
import {hashPasswordWithKdf,verifyPasswordWithKdf} from './password-kdf';
import {all,one,run,stmt,db,config,uid} from './db';
export class AppError extends Error{constructor(message:string,public status=400){super(message)}}
export const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
export const token=()=>randomBytes(32).toString('hex');
export const cookieName='dti_session';
export const hashPassword=(password:string)=>hashPasswordWithKdf(env.PASSWORD_KDF,password);
export const verifyPassword=(password:string,stored:string)=>verifyPasswordWithKdf(env.PASSWORD_KDF,password,stored);
export function cookie(value:string,req:Request,maxAge=60*60*24*7){const u=new URL(req.url),local=['localhost','127.0.0.1'].includes(u.hostname);return cookieName+'='+value+'; Path=/; HttpOnly; SameSite=Lax; Max-Age='+maxAge+(local&&u.protocol==='http:'?'':'; Secure')}
export async function sessionFor(req?:Request){let raw:string|undefined;if(req){raw=req.headers.get('cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith(cookieName+'='))?.slice(cookieName.length+1)}else raw=(await cookies()).get(cookieName)?.value;if(!raw)return null;return one('SELECT s.*,u.name,u.email,u.role FROM sessions s LEFT JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires>?',hash(raw),Date.now())}
export async function ensureSession(req:Request){const current=await sessionFor(req);if(current)return {session:current,setCookie:null};const raw=token(),id=uid(),csrf=token();await db().batch([stmt('INSERT INTO sessions (id,token_hash,csrf,expires) VALUES (?,?,?,?)',id,hash(raw),csrf,Date.now()+604800000),stmt('INSERT INTO carts (id,session_id) VALUES (?,?)',uid(),id)]);return{session:{id,csrf,user_id:null,role:null},setCookie:cookie(raw,req)}}
export function viewer(s:any){return s?.user_id?{id:s.user_id,name:s.name,email:s.email,role:s.role}:null}
export async function requireAdmin(req?:Request){const s=await sessionFor(req);if(!s?.user_id||s.role!=='admin'||!await one('SELECT user_id FROM admins WHERE user_id=?',s.user_id))throw new AppError('Administrator sign-in is required.',403);return s}
export async function limit(key:string,max=10,period=900000){const now=Date.now();const r=await one('INSERT INTO rate_limits (key,count,expires) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires<? THEN 1 ELSE count+1 END,expires=CASE WHEN expires<? THEN excluded.expires ELSE expires END RETURNING count',key,now+period,now,now);if(r.count>max)throw new AppError('Too many attempts. Please wait a few minutes and try again.',429)}
export function checkOrigin(req:Request){const origin=req.headers.get('origin');const here=new URL(req.url);const expected=config('APP_URL')||'http://localhost:5173';const local=['localhost','127.0.0.1'].includes(here.hostname)&&origin===here.origin;if(!origin||(!local&&origin!==new URL(expected).origin))throw new AppError('This request could not be verified. Refresh the page and try again.',403)}
export async function checkMutation(req:Request){checkOrigin(req);const s=await sessionFor(req);if(!s||req.headers.get('x-csrf-token')!==s.csrf)throw new AppError('Your session changed. Refresh the page and try again.',403);await limit('write:'+s.id,100,60000);return s}
export async function sendPendingEmails(){const key=config('EMAIL_API_KEY'),from=config('EMAIL_FROM');if(!key||!from)return;const jobs=await all("SELECT * FROM email_outbox WHERE status='pending' AND attempts<5 LIMIT 8");for(const job of jobs){await run('UPDATE email_outbox SET attempts=attempts+1 WHERE id=?',job.id);try{const res=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json','Idempotency-Key':job.dedupe_key},body:JSON.stringify({from,to:job.recipient,subject:job.subject,text:job.body})});if(res.ok)await run("UPDATE email_outbox SET status='sent' WHERE id=?",job.id)}catch{console.error('Email delivery unavailable for queued message',job.id)}}}
