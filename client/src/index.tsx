import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ErrorBoundary } from 'react-error-boundary';

import { AppContainer } from '@lark-apaas/client-toolkit/components/AppContainer';
import { ErrorRender } from '@lark-apaas/client-toolkit/components/ErrorRender';

import RoutesComponent from './app.tsx';
import './index.css';
import { createPortal } from 'react-dom';
import { Toaster } from '@client/src/components/ui/sonner';

const configuredBasePath = process.env.CLIENT_BASE_PATH
  ?.replace(/^['"]|['"]$/g, '')
  .replace(/\/+$/, '');
const localAppBasePath = window.location.pathname.match(/^\/app\/app_[^/]+/)?.[0];
const CLIENT_BASE_PATH = localAppBasePath || configuredBasePath || '/';

function configureLocalDevelopmentCsrf(): void {
  if (process.env.NODE_ENV !== 'development') return;
  if (!['127.0.0.1', 'localhost'].includes(window.location.hostname)) return;

  const csrfToken = 'local-dev-csrf';
  document.cookie = `suda-csrf-token=${csrfToken}; Path=${CLIENT_BASE_PATH}; SameSite=Lax`;
  window.csrfToken = csrfToken;
}

configureLocalDevelopmentCsrf();

const MainApp = () => {
  return (
    <BrowserRouter basename={CLIENT_BASE_PATH}>
      <AppContainer defaultTheme="light">
        <ErrorBoundary
          fallbackRender={({ error, resetErrorBoundary }) => (
            <ErrorRender
              error={error as Error}
              resetErrorBoundary={resetErrorBoundary}
            />
          )}
        >
          <RoutesComponent />
          {createPortal(<Toaster />, document.body)}
        </ErrorBoundary>
      </AppContainer>
    </BrowserRouter>
  );
};

createRoot(document.getElementById('root')!).render(<MainApp />);
