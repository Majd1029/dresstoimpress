type PreviewEnv = {SITE_VISIBILITY?: string; PREVIEW_ACCESS_USER?: string; PREVIEW_ACCESS_PASSWORD?: string};

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
  const expected = btoa(`${env.PREVIEW_ACCESS_USER || 'owner'}:${password}`);
  const actual = request.headers.get('authorization') || '';
  if (await sameSecret(actual, `Basic ${expected}`)) return null;
  return new Response('Sign in to preview Dress to Impress.', {
    status: 401, headers: {'WWW-Authenticate': 'Basic realm="Dress to Impress preview", charset="UTF-8"',
      'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow'},
  });
}
