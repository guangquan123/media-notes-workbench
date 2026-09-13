import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface AppErrorBoundaryProps {
  children: React.ReactNode;
}

interface AppErrorBoundaryState {
  error: Error | null;
}

export default class AppErrorBoundary extends React.Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  public state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error): void {
    const message: string = error.message || '未知渲染错误';
    document.title = '工作台需要重新加载';
    window.dispatchEvent(
      new CustomEvent('workbench-render-error', { detail: message }),
    );
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  render(): React.ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <section className="w-full max-w-lg rounded-xl border border-red-200 bg-white p-8 shadow-sm">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-red-600" />
            <div>
              <h1 className="text-lg font-semibold text-slate-950">
                工作台暂时无法显示
              </h1>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                页面渲染遇到问题，已保护你的配置和笔记数据。请重新加载后继续。
              </p>
              <details className="mt-4 text-xs text-slate-500">
                <summary className="cursor-pointer">查看诊断信息</summary>
                <p className="mt-2 break-words">{this.state.error.message}</p>
              </details>
              <Button
                className="mt-6"
                data-ai-section-type="button"
                onClick={this.handleReload}
              >
                <RefreshCw className="size-4" />
                重新加载
              </Button>
            </div>
          </div>
        </section>
      </main>
    );
  }
}
