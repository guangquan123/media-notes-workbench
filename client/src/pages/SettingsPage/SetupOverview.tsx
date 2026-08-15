import type { ReactElement } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  CircleAlert,
  CircleDashed,
  LoaderCircle,
  RefreshCw,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import type {
  ConnectorSettingsResponse,
  ExternalModelSettings,
  RuntimeStatus,
  SystemReadiness,
  TaskNotificationSettings,
  TencentAsrSettings,
} from '@shared/api.interface';
import {
  getConnectorSettings,
  getExternalModelSettings,
  getReadiness,
  getRuntimeStatus,
  getTaskNotificationSettings,
  getTencentAsrSettings,
} from '@/api';
import { Button } from '@/components/ui/button';
import {
  buildSetupReadiness,
  type SetupActionSection,
  type SetupCapabilityItem,
  type SetupCapabilityStatus,
  type SetupReadinessResult,
} from './setup-readiness.utils';

interface SetupOverviewProps {
  onSelectSection: (section: SetupActionSection) => void;
}

interface SetupSnapshot {
  connectors: ConnectorSettingsResponse | null;
  externalModel: ExternalModelSettings | null;
  notifications: TaskNotificationSettings | null;
  readiness: SystemReadiness;
  runtime: RuntimeStatus | null;
  tencentAsr: TencentAsrSettings | null;
}

function settledValue<T>(result: PromiseSettledResult<T>): T | null {
  return result.status === 'fulfilled' ? result.value : null;
}

function getStatusPresentation(status: SetupCapabilityStatus): {
  className: string;
  icon: typeof CheckCircle2;
  label: string;
} {
  if (status === 'ready') {
    return {
      className: 'border-emerald-200 bg-emerald-50 text-emerald-800',
      icon: CheckCircle2,
      label: '已就绪',
    };
  }
  if (status === 'action') {
    return {
      className: 'border-amber-200 bg-amber-50 text-amber-900',
      icon: CircleAlert,
      label: '需要配置',
    };
  }
  return {
    className: 'border-black/10 bg-black/[0.035] text-black/55',
    icon: CircleDashed,
    label: '按需启用',
  };
}

const SetupOverview: React.FC<SetupOverviewProps> = ({ onSelectSection }) => {
  const [snapshot, setSnapshot] = useState<SetupSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError('');
    const [
      readinessResult,
      connectorResult,
      asrResult,
      modelResult,
      runtimeResult,
      notificationResult,
    ] = await Promise.allSettled([
      getReadiness(),
      getConnectorSettings(),
      getTencentAsrSettings(),
      getExternalModelSettings(),
      getRuntimeStatus(),
      getTaskNotificationSettings(),
    ]);
    const readiness = settledValue(readinessResult);
    if (!readiness) {
      setSnapshot(null);
      setError('无法读取环境状态。请确认本地服务已启动，然后重新检测。');
      setLoading(false);
      return;
    }
    setSnapshot({
      connectors: settledValue(connectorResult),
      externalModel: settledValue(modelResult),
      notifications: settledValue(notificationResult),
      readiness,
      runtime: settledValue(runtimeResult),
      tencentAsr: settledValue(asrResult),
    });
    setLoading(false);
  }, []);

  useEffect((): void => {
    void load();
  }, [load]);

  const result: SetupReadinessResult | null = useMemo(
    () => (snapshot ? buildSetupReadiness(snapshot) : null),
    [snapshot],
  );

  if (loading && !result) {
    return (
      <div className="rounded-2xl border border-black/8 bg-white p-8 text-sm text-black/50">
        <LoaderCircle className="mr-2 inline size-4 animate-spin" />
        正在检测当前环境与可用能力…
      </div>
    );
  }

  if (error || !result) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-950">
        <div className="flex items-start gap-3">
          <CircleAlert className="mt-0.5 size-5 shrink-0" />
          <div className="grid gap-3">
            <div>
              <p className="font-semibold">环境检测暂不可用</p>
              <p className="mt-1 text-sm leading-6 text-red-900/70">{error}</p>
            </div>
            <Button
              className="w-fit"
              onClick={() => void load()}
              variant="outline"
            >
              <RefreshCw className="size-4" />
              重新检测
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const summaryTone =
    result.status === 'ready'
      ? 'border-emerald-200 bg-emerald-50'
      : result.status === 'partial'
        ? 'border-sky-200 bg-sky-50'
        : 'border-amber-200 bg-amber-50';

  return (
    <div className="space-y-6 text-[#161616]">
      <section className={`rounded-2xl border p-6 md:p-7 ${summaryTone}`}>
        <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div className="max-w-2xl">
            <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-black/45">
              <ShieldCheck className="size-4" />
              开始使用
            </div>
            <h1 className="text-2xl font-semibold tracking-tight">
              {result.headline}
            </h1>
            <p className="mt-2 text-sm leading-6 text-black/60">
              {result.summary}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {result.availableSourceLabels.length > 0 ? (
                result.availableSourceLabels.map((label) => (
                  <span
                    className="rounded-full border border-black/8 bg-white/70 px-3 py-1 text-xs font-medium text-black/65"
                    key={label}
                  >
                    {label}
                  </span>
                ))
              ) : (
                <span className="text-xs text-black/45">
                  暂无完整可用的资料入口
                </span>
              )}
            </div>
          </div>
          <Button
            className="shrink-0 bg-white/75 text-black/70 hover:bg-white hover:text-black"
            disabled={loading}
            onClick={() => void load()}
            variant="outline"
          >
            {loading ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            重新检测
          </Button>
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold">能力清单</p>
            <p className="mt-1 text-xs leading-5 text-black/45">
              只把真正阻塞使用的项目标为“需要配置”，其余能力可以稍后启用。
            </p>
          </div>
          <div className="hidden items-center gap-1.5 text-xs text-black/45 sm:flex">
            <Sparkles className="size-3.5" />
            推荐默认：本地输出
          </div>
        </div>
        <div className="grid gap-3" data-ai-section-type="card-list">
          {result.items.map((item: SetupCapabilityItem): ReactElement => {
            const presentation = getStatusPresentation(item.status);
            const StatusIcon = presentation.icon;
            return (
              <article
                className="rounded-2xl border border-black/8 bg-white p-5 shadow-[0_10px_35px_rgba(15,23,42,0.035)]"
                key={item.id}
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold">{item.label}</h2>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium ${presentation.className}`}
                      >
                        <StatusIcon className="size-3.5" />
                        {presentation.label}
                      </span>
                      <span className="text-xs text-black/35">
                        {item.required ? '基础能力' : '可选能力'}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-black/65">
                      {item.description}
                    </p>
                    {item.details.length > 0 && (
                      <ul className="mt-3 grid gap-1.5 text-xs leading-5 text-black/45">
                        {item.details.map((detail) => (
                          <li className="flex gap-2" key={detail}>
                            <span className="mt-2 size-1 shrink-0 rounded-full bg-black/25" />
                            <span>{detail}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  {item.actionSection && item.actionLabel && (
                    <Button
                      className="shrink-0"
                      onClick={() => onSelectSection(item.actionSection!)}
                      variant={item.status === 'action' ? 'default' : 'outline'}
                    >
                      {item.actionLabel}
                      <ArrowRight className="size-4" />
                    </Button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
};

export default SetupOverview;
