import { useEffect, useState, type ReactElement } from 'react';
import {
  Clock3,
  Power,
  RefreshCw,
  RotateCw,
  Server,
  X,
} from 'lucide-react';
import {
  cancelScheduledRuntimeStop,
  getRuntimeControlStatus,
  restartRuntime,
  stopRuntime,
} from '@/api';
import { Button } from '@/components/ui/button';
import type { RuntimeControlState, RuntimeControlStatus } from '@shared/api.interface';

const POLL_INTERVAL_MS = 5_000;

function stateLabel(state: RuntimeControlState): string {
  if (state === 'draining') return '任务完成后停止';
  if (state === 'stopping') return '正在停止';
  return '运行中';
}

export default function RuntimeControlMenu(): ReactElement {
  const [status, setStatus] = useState<RuntimeControlStatus | null>(null);
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  const refresh = async (): Promise<void> => {
    try {
      setStatus(await getRuntimeControlStatus());
      setError('');
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '运行状态读取失败');
    }
  };

  useEffect((): (() => void) => {
    void refresh();
    const intervalId: number = window.setInterval(() => void refresh(), POLL_INTERVAL_MS);
    return (): void => window.clearInterval(intervalId);
  }, []);

  const run = async (action: () => Promise<unknown>): Promise<void> => {
    setBusy(true);
    setError('');
    try {
      await action();
      await refresh();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '操作失败，请稍后重试');
    } finally {
      setBusy(false);
    }
  };

  if (!status && !error) return <></>;

  return (
    <aside
      aria-label="本地服务控制"
      className="fixed right-4 top-4 z-40 w-[min(22rem,calc(100vw-2rem))] rounded-lg border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-2">
          <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-slate-900 text-white">
            <Server className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-950">本地服务</p>
            <p className="text-xs text-slate-500">
              {status ? `${stateLabel(status.state)} · ${status.activeTaskCount} 个任务` : '正在读取状态'}
            </p>
          </div>
        </div>
        <Button
          aria-label="刷新服务状态"
          data-ai-section-type="button"
          disabled={busy}
          onClick={() => void refresh()}
          size="icon"
          variant="ghost"
        >
          <RefreshCw className="size-4" />
        </Button>
      </div>
      {error && <p className="mt-2 break-words text-xs text-red-700">{error}</p>}
      {status && (
        <div className="mt-3 flex flex-wrap gap-2">
          {status.scheduledStop ? (
            <Button
              data-ai-section-type="button"
              disabled={busy}
              onClick={() => void run(cancelScheduledRuntimeStop)}
              size="sm"
              variant="outline"
            >
              <X className="size-4" />取消计划
            </Button>
          ) : (
            <>
              <Button
                data-ai-section-type="button"
                disabled={busy || !status.canStopImmediately}
                onClick={() => void run(() => stopRuntime({ mode: 'after_tasks' }))}
                size="sm"
                variant="outline"
              >
                <Clock3 className="size-4" />任务完成后停止
              </Button>
              <Button
                data-ai-section-type="button"
                disabled={busy || !status.canStopImmediately}
                onClick={() => void run(() => stopRuntime({ mode: 'immediate' }))}
                size="sm"
                variant="destructive"
              >
                <Power className="size-4" />立即停止
              </Button>
            </>
          )}
          <Button
            data-ai-section-type="button"
            disabled={busy || status.state === 'stopping'}
            onClick={() => void run(restartRuntime)}
            size="sm"
            variant="ghost"
          >
            <RotateCw className="size-4" />重启
          </Button>
        </div>
      )}
    </aside>
  );
}
