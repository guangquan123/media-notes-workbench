import path from 'path';
import { defineConfig } from '@lark-apaas/fullstack-vite-preset';

const clientBasePath: string =
  (process.env.CLIENT_BASE_PATH || '/').replace(/\/+$/, '') || '';
const stableMode: boolean = process.env.VITE_STABLE_MODE === 'true';

export default defineConfig({
  root: path.resolve(__dirname, 'client'),
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'client/src'),
    },
  },
  define: {
    'process.env.CLIENT_BASE_PATH': JSON.stringify(clientBasePath),
  },
  optimizeDeps: {
    esbuildOptions: {
      define: {
        'process.env.CLIENT_BASE_PATH': JSON.stringify(clientBasePath),
      },
    },
  },
  server: {
    host: process.env.CLIENT_DEV_HOST || '127.0.0.1',
    hmr: stableMode ? false : undefined,
    watch: stableMode ? null : undefined,
  },
});
