import path from 'path';
import { defineConfig } from '@lark-apaas/fullstack-vite-preset';

const clientBasePath: string =
  (process.env.CLIENT_BASE_PATH || '/').replace(/\/+$/, '') || '';
const localRuntime: boolean = process.env.VITE_RUNTIME === 'local';
const stableMode: boolean = process.env.VITE_STABLE_MODE === 'true';
const localApiPrefix: string = `${clientBasePath}/api`;
const localApiTarget: string =
  `http://${process.env.SERVER_HOST || '127.0.0.1'}:${process.env.SERVER_PORT || '3000'}`;
const localRuntimeAliases = localRuntime
  ? {
      '@lark-apaas/client-toolkit/components/AppContainer': path.resolve(
        __dirname,
        'client/src/lib/local-app-container.tsx',
      ),
      '@lark-apaas/client-toolkit/components/ErrorRender': path.resolve(
        __dirname,
        'client/src/lib/local-app-container.tsx',
      ),
      '@lark-apaas/client-toolkit/logger': path.resolve(__dirname, 'client/src/lib/local-http.ts'),
      '@lark-apaas/client-toolkit/utils/getAxiosForBackend': path.resolve(__dirname, 'client/src/lib/local-http.ts'),
      '@lark-apaas/observable-web': path.resolve(
        __dirname,
        'client/src/lib/local-observable.ts',
      ),
    }
  : {};

export default defineConfig({
  root: path.resolve(__dirname, 'client'),
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'client/src'),
      ...localRuntimeAliases,
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
    proxy: localRuntime
      ? {
          [localApiPrefix]: {
            target: localApiTarget,
            changeOrigin: true,
            rewrite: (requestPath: string) =>
              requestPath.slice(clientBasePath.length),
          },
        }
      : undefined,
  },
});
