import { useCallback, useEffect, useRef, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { CircleAlert, RefreshCw } from 'lucide-react';
import { getRuntimeStatus } from '@/api';
import {
  describeBackendFailure,
  type BackendHealthState,
  nextBackendHealthState,
} from '@/lib/backend-health';
import { isLocalRuntime } from '@/lib/runtime';
import { Button } from '@/components/ui/button';

const BACKEND_HEALTH_INTERVAL_MS = 5_000;
const INITIAL_BACKEND_HEALTH: BackendHealthState = {
  consecutiveFailures: 0,
  unavailable: false,
};

function reportLauncherPageReady(): void {
  const token = new URLSearchParams(window.location.search).get(
    'launcherReadyToken',
  );
  if (!token) return;

  const basePath =
    window.location.pathname.match(/^\/app\/app_[^/]+/)?.[0] || '';
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
            window.history.replaceState(
              {},
              document.title,
              window.location.pathname,
            );
          }
        })
        .catch(() => undefined);
    });
  });
}

const Layout = () => {
  const [backendHealth, setBackendHealth] = useState<BackendHealthState>(
    INITIAL_BACKEND_HEALTH,
  );
  const [backendFailure, setBackendFailure] = useState<string>('');
  const healthCheckInFlight = useRef<boolean>(false);

  const checkBackendHealth = useCallback(async (): Promise<void> => {
    if (!isLocalRuntime() || healthCheckInFlight.current) return;
    healthCheckInFlight.current = true;
    try {
      const status = await getRuntimeStatus();
      if (!status.ready) throw new Error('后台报告未就绪');
      setBackendHealth((current: BackendHealthState) =>
        nextBackendHealthState(current, true),
      );
      setBackendFailure('');
    } catch (error) {
      setBackendFailure(describeBackendFailure(error));
      setBackendHealth((current: BackendHealthState) =>
        nextBackendHealthState(current, false),
      );
    } finally {
      healthCheckInFlight.current = false;
    }
  }, []);

  useEffect(() => {
    reportLauncherPageReady();
    if (!isLocalRuntime()) return undefined;

    void checkBackendHealth();
    const intervalId: number = window.setInterval(
      () => void checkBackendHealth(),
      BACKEND_HEALTH_INTERVAL_MS,
    );
    const handleOnline = (): void => void checkBackendHealth();
    const handleVisibilityChange = (): void => {
      if (document.visibilityState === 'visible') void checkBackendHealth();
    };
    window.addEventListener('online', handleOnline);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return (): void => {
      window.clearInterval(intervalId);
      window.removeEventListener('online', handleOnline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [checkBackendHealth]);

  return (
    <div
      className="min-h-screen w-full min-w-0 max-w-full"
      data-launcher-page-ready="true"
    >
      {backendHealth.unavailable && (
        <div
          className="sticky top-0 z-50 border-b border-red-300 bg-red-50 px-4 py-3 text-red-950 shadow-sm"
          role="alert"
        >
          <div className="mx-auto flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <CircleAlert className="mt-0.5 size-5 shrink-0" />
              <div className="min-w-0">
                <p className="font-semibold">后台服务已失联</p>
                <p className="mt-0.5 text-sm leading-6 text-red-900/75">
                  当前页面可能来自浏览器缓存，请暂时不要提交或保存。请运行
                  “重启多媒体笔记工作台.vbs”，等待启动器验证完成。
                </p>
                {backendFailure && (
                  <p className="mt-1 break-words text-xs text-red-900/55">
                    检测信息：{backendFailure}
                  </p>
                )}
              </div>
            </div>
            <Button
              className="shrink-0"
              data-ai-section-type="button"
              onClick={() => void checkBackendHealth()}
              variant="outline"
            >
              <RefreshCw className="size-4" />
              重新检测
            </Button>
          </div>
        </div>
      )}
      <Outlet />
    </div>
  );
};

export default Layout;
