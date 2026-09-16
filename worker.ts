import handler from 'vinext/server/fetch-handler';
import {previewGate} from './lib/preview-gate';

export default {
  async fetch(request: Request, env: Cloudflare.Env, ctx: ExecutionContext) {
    const blocked = await previewGate(request, env);
    if (blocked) return blocked;
    // Workers-first routing keeps assets behind the preview gate. Serve exact
    // asset matches explicitly; Vinext owns dynamic routes and their 404s.
    if (env.ASSETS && ['GET', 'HEAD'].includes(request.method)) {
      const asset = await env.ASSETS.fetch(request);
      if (asset.status !== 404) return asset;
    }
    return handler.fetch(request, env, ctx);
  },
};
