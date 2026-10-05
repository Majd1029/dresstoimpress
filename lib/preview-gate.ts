type PreviewEnv = {SITE_VISIBILITY?: string; PREVIEW_ACCESS_USER?: string; PREVIEW_ACCESS_PASSWORD?: string};
const cookieName = '__Host-dti_preview';
const headers = {'Cache-Control':'no-store', 'X-Robots-Tag':'noindex, nofollow'};
async function signature(value: string, password: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), {name:'HMAC',hash:'SHA-256'}, false, ['sign']);
  return Array.from(new Uint8Array(await crypto.subtle.sign('HMAC',key,encoder.encode(value))), b=>b.toString(16).padStart(2,'0')).join('');
}
function loginPage(error = false) {
  return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Dress to Impress — Private preview</title><style>body{margin:0;background:#f7f3ed;color:#231b1b;font:16px system-ui;display:grid;min-height:100svh;place-items:center}main{max-width:380px;padding:36px}h1{font:36px Georgia}label{display:block;margin:24px 0 8px}input,button{box-sizing:border-box;width:100%;padding:14px;font:inherit;border:1px solid #ac9b94;border-radius:5px}button{margin-top:16px;background:#50232b;color:white;cursor:pointer}p{line-height:1.6}.error{color:#982d28}</style><main><p>PRIVATE PREVIEW</p><h1>Dress to Impress</h1><p>Enter your preview password to open the store. Your administrator login comes next.</p>${error?'<p class="error" role="alert">The preview password was not accepted. Please try again.</p>':''}<form action="/__preview" method="post"><label for="password">Preview password</label><input id="password" name="password" type="password" autocomplete="current-password" maxlength="256" required><button type="submit">Open the store</button></form></main></html>`,{status:error?403:200,headers:{...headers,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",'X-Content-Type-Options':'nosniff'}});
}

async function sameSecret(left: string, right: string) {
  const encode = new TextEncoder();
  const [a, b] = await Promise.all([left, right].map(value =>
    crypto.subtle.digest('SHA-256', encode.encode(value))));
  const first = new Uint8Array(a), second = new Uint8Array(b);
  let different = 0;
  for (let i = 0; i < first.length; i++) different |= first[i] ^ second[i];
  return different === 0;
}

/** Preserve private review access after removing the managed ChatGPT gate. */
export async function previewGate(request: Request, env: PreviewEnv): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) return null;
  if (env.SITE_VISIBILITY === 'public') return null;
  const password = env.PREVIEW_ACCESS_PASSWORD || '';
  if (password.length < 32) return new Response('Private preview is awaiting owner configuration.', {
    status: 503, headers: {'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow'},
  });
  if (url.pathname === '/__preview' && request.method === 'POST') {
    if (request.headers.get('origin') !== url.origin || !request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded')) return new Response('Invalid sign-in request.',{status:403,headers});
    const reader=request.body?.getReader(); let body='';
    if(reader){const decoder=new TextDecoder();let length=0;while(true){const chunk=await reader.read();if(chunk.done)break;length+=chunk.value.byteLength;if(length>2048){await reader.cancel();return new Response('Request too large.',{status:413,headers});}body+=decoder.decode(chunk.value,{stream:true});}body+=decoder.decode();}
    if (!await sameSecret(new URLSearchParams(body).get('password') || '', password)) return loginPage(true);
    const expires=String(Math.floor(Date.now()/1000)+86400);
    const value=expires+'.'+await signature(expires,password);
    return new Response(null,{status:303,headers:{...headers,Location:'/', 'Set-Cookie':`${cookieName}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=86400`}});
  }
  const saved=request.headers.get('cookie')?.split(';').map(v=>v.trim()).find(v=>v.startsWith(cookieName+'='))?.slice(cookieName.length+1) || '';
  const match=/^(\d{10})\.([a-f0-9]{64})$/.exec(saved);
  if(match && Number(match[1])>Math.floor(Date.now()/1000) && Number(match[1])<=Math.floor(Date.now()/1000)+86400 && await sameSecret(match[2],await signature(match[1],password))) return null;
  const expected = btoa(`${env.PREVIEW_ACCESS_USER || 'owner'}:${password}`);
  const actual = request.headers.get('authorization') || '';
  if (await sameSecret(actual, `Basic ${expected}`)) return null;
  if (request.method==='GET' && !url.pathname.startsWith('/api/') && !url.pathname.startsWith('/_next/')) return loginPage();
  return new Response('Sign in to preview Dress to Impress.', {status:401,headers});
}
