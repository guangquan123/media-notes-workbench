import { useEffect, useState, type ReactElement } from 'react';
import {
  CheckCircle2,
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
  getRuntimeStatus,
  restartRuntime,
  stopRuntime,
} from '@/api';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type {
  RuntimeControlState,
  RuntimeControlStatus,
} from '@shared/api.interface';

const POLL_INTERVAL_MS = 5_000;
const TRANSITION_POLL_INTERVAL_MS = 1_000;
const RESTART_TIMEOUT_MS = 60_000;
const STOP_TIMEOUT_MS = 20_000;
export const RUNTIME_TRANSITION_EVENT = 'workbench-runtime-transition';

type RuntimeTransition = 'restarting' | 'stopping';

function stateLabel(state: RuntimeControlState): string {
  if (state === 'draining') return '任务完成后停止';
  if (state === 'stopping') return '正在停止';
  return '运行中';
}

function dispatchTransition(transition: RuntimeTransition | null): void {
  window.dispatchEvent(
    new CustomEvent(RUNTIME_TRANSITION_EVENT, { detail: { transition } }),
  );
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export default function RuntimeControlMenu(): ReactElement {
  const [status, setStatus] = useState<RuntimeControlStatus | null>(null);
  const [expanded, setExpanded] = useState<boolean>(false);
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [operationMessage, setOperationMessage] = useState<string>('');
  const [confirmAction, setConfirmAction] = useState<'stop' | 'restart' | null>(null);

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

  const runSimple = async (action: () => Promise<unknown>): Promise<void> => {
    setBusy(true);
    setError('');
    setOperationMessage('');
    try {
      await action();
      await refresh();
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : '操作失败，请稍后重试');
    } finally {
      setBusy(false);
    }
  };

  const handleStop = async (mode: 'immediate' | 'after_tasks'): Promise<void> => {
    setConfirmAction(null);
    setBusy(true);
    setError('');
    setOperationMessage('正在停止本地服务，请稍候…');
    dispatchTransition('stopping');
    try {
      await stopRuntime({ mode });
      if (mode === 'after_tasks') {
        setOperationMessage('已安排在任务完成后停止。');
        await refresh();
        return;
      }
      const deadline: number = Date.now() + STOP_TIMEOUT_MS;
      while (Date.now() < deadline) {
        try {
          await getRuntimeStatus();
        } catch {
          setOperationMessage('本地服务已停止。请使用桌面图标或开始菜单重新启动。');
          return;
        }
        await wait(TRANSITION_POLL_INTERVAL_MS);
      }
      setError('服务仍在停止，请稍后重新检测；如持续无响应，请查看日志。');
    } catch (nextError) {
      dispatchTransition(null);
      setError(nextError instanceof Error ? nextError.message : '停止失败，请稍后重试');
      setOperationMessage('');
    } finally {
      setBusy(false);
    }
  };

  const handleRestart = async (): Promise<void> => {
    setConfirmAction(null);
    setBusy(true);
    setError('');
    setOperationMessage('正在重启本地服务，页面会自动恢复…');
    dispatchTransition('restarting');
    try {
      await restartRuntime();
      await wait(750);
      let restartObservedDown: boolean = false;
      const deadline: number = Date.now() + RESTART_TIMEOUT_MS;
      while (Date.now() < deadline) {
        try {
          const runtimeStatus = await getRuntimeStatus();
          if (restartObservedDown && runtimeStatus.ready) {
            dispatchTransition(null);
            window.location.reload();
            return;
          }
        } catch {
          restartObservedDown = true;
        }
        await wait(TRANSITION_POLL_INTERVAL_MS);
      }
      setError('重启等待超时，请点击重新检测或查看日志。');
    } catch (nextError) {
      dispatchTransition(null);
      setError(nextError instanceof Error ? nextError.message : '重启失败，请稍后重试');
      setOperationMessage('');
    } finally {
      setBusy(false);
    }
  };

  const activeTaskCount: number = status?.activeTaskCount ?? 0;
  const statusText: string = status
    ? `${stateLabel(status.state)} · ${activeTaskCount} 个任务`
    : '正在读取状态';

  return (
    <>
      <div className="fixed bottom-5 right-5 z-40 sm:bottom-6 sm:right-6">
        {!expanded && (
          <Button
            aria-expanded={expanded}
            aria-label={`打开本地服务控制，${statusText}`}
            className="rounded-full border-slate-800 bg-slate-950 px-4 text-white shadow-lg shadow-slate-950/20 hover:bg-slate-800"
            data-ai-section-type="button"
            onClick={() => setExpanded(true)}
            size="sm"
            title="本地服务控制"
            variant="default"
          >
            <Server className="size-4" />
            <span>本地服务</span>
          </Button>
        )}
        {expanded && (
          <aside
            aria-label="本地服务控制"
            className="w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-xl backdrop-blur"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-start gap-2">
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-slate-900 text-white">
                  <Server className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-950">本地服务</p>
                  <p aria-live="polite" className="text-xs text-slate-500">{statusText}</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  aria-label="刷新服务状态"
                  data-ai-section-type="button"
                  disabled={busy}
                  onClick={() => void refresh()}
                  size="icon"
                  title="刷新服务状态"
                  variant="ghost"
                >
                  <RefreshCw className="size-4" />
                </Button>
                <Button
                  aria-label="关闭本地服务控制"
                  data-ai-section-type="button"
                  onClick={() => setExpanded(false)}
                  size="icon"
                  title="关闭"
                  variant="ghost"
                >
                  <X className="size-4" />
                </Button>
              </div>
            </div>
            {error && <p className="mt-2 break-words text-xs text-red-700" role="alert">{error}</p>}
            {operationMessage && (
              <p className="mt-2 flex items-start gap-1.5 text-xs text-slate-600" role="status">
                <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" />
                <span>{operationMessage}</span>
              </p>
            )}
            {status && (
              <div className="mt-3 flex flex-wrap gap-2">
                {status.scheduledStop ? (
                  <Button
                    data-ai-section-type="button"
                    disabled={busy}
                    onClick={() => void runSimple(cancelScheduledRuntimeStop)}
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
                      onClick={() => void handleStop('after_tasks')}
                      size="sm"
                      variant="outline"
                    >
                      <Clock3 className="size-4" />
                      {activeTaskCount > 0 ? '任务完成后停止' : '停止服务'}
                    </Button>
                    <Button
                      data-ai-section-type="button"
                      disabled={busy || !status.canStopImmediately}
                      onClick={() => setConfirmAction('stop')}
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
                  onClick={() => {
                    if (activeTaskCount > 0) setConfirmAction('restart');
                    else void handleRestart();
                  }}
                  size="sm"
                  variant="ghost"
                >
                  <RotateCw className="size-4" />重启
                </Button>
              </div>
            )}
          </aside>
        )}
      </div>
      <AlertDialog
        onOpenChange={(open: boolean): void => {
          if (!open && !busy) setConfirmAction(null);
        }}
        open={confirmAction !== null}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction === 'stop' ? '立即停止本地服务？' : '重启本地服务？'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction === 'stop'
                ? '正在处理的任务可能被中断，未保存的内容也可能无法恢复。确定要立即停止吗？'
                : `当前有 ${activeTaskCount} 个任务正在处理。为避免数据损坏，建议等待任务完成后再重启。`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={(event): void => {
                event.preventDefault();
                if (confirmAction === 'stop') void handleStop('immediate');
                else void handleRestart();
              }}
            >
              {confirmAction === 'stop' ? '立即停止' : '继续重启'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
