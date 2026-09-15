import { AlertTriangle, ArrowRight, LoaderCircle, Settings2 } from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { getAiModelSettings, getReadiness } from '@/api';
import { Button } from '@/components/ui/button';
import { getCapabilityGateResult, type CapabilityGateIssue } from '@/lib/capability-gate';
import { isLocalRuntime } from '@/lib/runtime';
import type { AiModelSettings, SetupCapability, SystemReadiness } from '@shared/api.interface';

interface CapabilityGateProps {
  capability: SetupCapability;
  children: ReactNode;
}

function buildSettingsUrl(
  section: CapabilityGateIssue['actionSection'],
  returnTo: string,
): string {
  const params = new URLSearchParams({ section, returnTo });
  return `/settings?${params.toString()}`;
}

export default function CapabilityGate({
  capability,
  children,
}: CapabilityGateProps) {
  const location = useLocation();
  const [readiness, setReadiness] = useState<SystemReadiness | null>(null);
  const [aiSettings, setAiSettings] = useState<AiModelSettings | null>(null);
  const [error, setError] = useState<string>('');
  const returnTo: string = `${location.pathname}${location.search}${location.hash}`;

  useEffect((): (() => void) => {
    let mounted = true;
    Promise.all([getReadiness(), getAiModelSettings()])
      .then(([nextReadiness, nextAiSettings]: [SystemReadiness, AiModelSettings]): void => {
        if (!mounted) return;
        setReadiness(nextReadiness);
        setAiSettings(nextAiSettings);
      })
      .catch((): void => {
        if (mounted) setError('暂时无法读取能力配置，请稍后重试。');
      });
    return (): void => {
      mounted = false;
    };
  }, [location.pathname]);

  const gate = useMemo(
    () =>
      readiness
        ? getCapabilityGateResult(
            capability,
            readiness,
            aiSettings,
            isLocalRuntime(),
          )
        : null,
    [aiSettings, capability, readiness],
  );

  if (!readiness && !error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="flex items-center gap-3 text-sm text-slate-600">
          <LoaderCircle className="size-5 animate-spin" />
          正在检查这项能力的配置…
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <section className="w-full max-w-lg rounded-2xl border border-amber-200 bg-white p-8 shadow-sm">
          <AlertTriangle className="size-7 text-amber-600" />
          <h1 className="mt-5 text-xl font-semibold text-slate-950">暂时无法开始</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">{error}</p>
          <Button className="mt-6" asChild>
            <Link to={`/settings?section=setup&returnTo=${encodeURIComponent(returnTo)}`}>
              打开参数配置
              <Settings2 className="size-4" />
            </Link>
          </Button>
        </section>
      </main>
    );
  }

  if (gate?.ready) return <>{children}</>;

  const issues: CapabilityGateIssue[] = gate?.issues || [];
  const firstIssue: CapabilityGateIssue | undefined = issues[0];
  const settingsUrl: string = buildSettingsUrl(
    firstIssue?.actionSection || 'setup',
    returnTo,
  );
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <section className="w-full max-w-xl rounded-2xl border border-amber-200 bg-white p-8 shadow-sm">
        <div className="flex size-12 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
          <AlertTriangle className="size-6" />
        </div>
        <p className="mt-6 text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">需要补充配置</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">这项功能还不能开始</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">完成下面的配置后再回来，系统会自动重新检查并继续当前入口。</p>
        <div className="mt-6 grid gap-3">
          {issues.map((issue: CapabilityGateIssue): ReactNode => (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4" key={issue.label}>
              <p className="text-sm font-semibold text-slate-900">需要配置：{issue.label}</p>
              <p className="mt-1 text-xs leading-5 text-slate-600">{issue.reason}</p>
            </div>
          ))}
        </div>
        <Button className="mt-7" asChild>
          <Link to={settingsUrl}>
            去参数配置
            <ArrowRight className="size-4" />
          </Link>
        </Button>
      </section>
    </main>
  );
}
