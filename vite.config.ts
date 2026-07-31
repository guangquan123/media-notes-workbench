import path from 'path';
import { defineConfig } from '@lark-apaas/fullstack-vite-preset';

const clientBasePath: string =
  (process.env.CLIENT_BASE_PATH || '/').replace(/\/+$/, '') || '';
const serverPort: string = process.env.SERVER_PORT || '3000';
const serverTarget: string = `http://127.0.0.1:${serverPort}`;
const stableMode: boolean = process.env.VITE_STABLE_MODE === 'true';

export default defineConfig({
  root: path.resolve(__dirname, 'client'),
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'client/src'),
    },
  },
  server: {
    host: process.env.CLIENT_DEV_HOST || '127.0.0.1',
    hmr: stableMode ? false : undefined,
    watch: stableMode ? null : undefined,
    proxy: {
      [`${clientBasePath}/api`]: { target: serverTarget },
      [`${clientBasePath}/openapi`]: { target: serverTarget },
      [`${clientBasePath}/__innerapi__`]: { target: serverTarget },
    },
  },
});
