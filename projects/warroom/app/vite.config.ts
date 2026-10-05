import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';

export default defineConfig({
  resolve: {
    alias: {
      '@troupe/team-events': fileURLToPath(new URL('../../../packages/team-events/src/index.ts', import.meta.url)),
      '@troupe/team-config': fileURLToPath(new URL('../../../packages/team-config/src/index.ts', import.meta.url)),
      '@troupe/simulation': fileURLToPath(new URL('../../../packages/simulation/src/index.ts', import.meta.url)),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
});
