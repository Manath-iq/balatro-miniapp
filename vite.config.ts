import { cloudflare } from '@cloudflare/vite-plugin';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [cloudflare()],
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    sourcemap: true,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
