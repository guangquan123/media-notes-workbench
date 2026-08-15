import { useEffect } from 'react';
import { Outlet } from 'react-router-dom';

function reportLauncherPageReady(): void {
  const token = new URLSearchParams(window.location.search).get('launcherReadyToken');
  if (!token) return;

  const basePath = window.location.pathname.match(/^\/app\/app_[^/]+/)?.[0] || '';
  const endpoint = `${basePath}/api/runtime/launcher-ready?token=${encodeURIComponent(token)}`;

  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => {
      void fetch(endpoint, {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
      })
        .then((response) => {
          if (response.ok) {
            window.history.replaceState({}, document.title, window.location.pathname);
          }
        })
        .catch(() => undefined);
    });
  });
}

const Layout = () => {
  useEffect(() => {
    reportLauncherPageReady();
  }, []);

  return (
    <div
      className="min-h-screen w-full min-w-0 max-w-full"
      data-launcher-page-ready="true"
    >
      <Outlet />
    </div>
  );
};

export default Layout;
