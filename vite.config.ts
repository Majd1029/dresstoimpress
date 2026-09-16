import './scripts/local-env.mjs';
import vinext from 'vinext';
import {defineConfig} from 'vite';
import {cloudflare} from '@cloudflare/vite-plugin';

export default defineConfig({
  plugins: [
    vinext(),
    cloudflare({
      configPath: 'wrangler.jsonc',
      viteEnvironment: {name: 'rsc', childEnvironments: ['ssr']},
      inspectorPort: false,
    }),
  ],
});
