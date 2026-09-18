import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  LoaderCircle,
  Settings2,
} from 'lucide-react';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  getAiModelSettings,
  getReadiness,
  getRecordingStorageSettings,
} from '@/api';
import { Button } from '@/components/ui/button';
import {
  getCapabilityGateResult,
  type CapabilityGateIssue,
} from '@/lib/capability-gate';
import { isLocalRuntime } from '@/lib/runtime';
import type {
  AiModelSettings,
  RecordingStorageSettings,
  SetupCapability,
  SystemReadiness,
} from '@shared/api.interface';

interface CapabilityGateProps {
  capability: SetupCapability;
  children: ReactNode;
  featureName?: string;
}

const CAPABILITY_NAMES: Record<SetupCapability, string> = {
  documents: '文档笔记',
  external_sync: '外部同步',
  local_audio: '录音文件笔记',
  local_video: '本地视频笔记',
  platform_video: '视频学习笔记',
  recording: '实时录音笔记',
};

function buildSettingsUrl(
  issue: CapabilityGateIssue | undefined,
  returnTo: string,
): string {
  const params = new URLSearchParams({
    section: issue?.actionSection || 'setup',
    returnTo,
  });
  if (issue?.actionTab) params.set('tab', issue.actionTab);
  return `/settings?${params.toString()}`;
}

export default function CapabilityGate({
  capability,
  children,
  featureName,
}: CapabilityGateProps) {
  const location = useLocation();
  const [readiness, setReadiness] = useState<SystemReadiness | null>(null);
  const [aiSettings, setAiSettings] = useState<AiModelSettings | null>(null);
  const [recordingStorage, setRecordingStorage] =
    useState<RecordingStorageSettings | null>(null);
  const [error, setError] = useState<string>('');
  const returnTo: string = `${location.pathname}${location.search}${location.hash}`;

  useEffect((): (() => void) => {
    let mounted = true;
    const settingsRequest: Promise<RecordingStorageSettings | null> =
      capability === 'recording'
        ? getRecordingStorageSettings()
        : Promise.resolve(null);
    Promise.all([getReadiness(true), getAiModelSettings(), settingsRequest])
      .then(
        ([nextReadiness, nextAiSettings, nextRecordingStorage]: [
          SystemReadiness,
          AiModelSettings,
          RecordingStorageSettings | null,
        ]): void => {
          if (!mounted) return;
          setReadiness(nextReadiness);
          setAiSettings(nextAiSettings);
          setRecordingStorage(nextRecordingStorage);
        },
      )
      .catch((): void => {
        if (mounted) setError('暂时无法读取能力配置，请稍后重试。');
      });
    return (): void => {
      mounted = false;
    };
  }, [capability, location.pathname]);

  const gate = useMemo(
    () =>
      readiness
        ? getCapabilityGateResult(
            capability,
            readiness,
            aiSettings,
            isLocalRuntime(),
            recordingStorage,
          )
        : null,
    [aiSettings, capability, readiness, recordingStorage],
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
          <h1 className="mt-5 text-xl font-semibold text-slate-950">
            暂时无法开始
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">{error}</p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Button asChild variant="ghost">
              <Link to="/">
                <ArrowLeft className="size-4" />
                返回工作台
              </Link>
            </Button>
            <Button asChild>
              <Link
                to={`/settings?section=setup&returnTo=${encodeURIComponent(returnTo)}`}
              >
                打开参数配置
                <Settings2 className="size-4" />
              </Link>
            </Button>
          </div>
        </section>
      </main>
    );
  }

  if (gate?.ready) return <>{children}</>;

  const issues: CapabilityGateIssue[] = gate?.issues || [];
  const firstIssue: CapabilityGateIssue | undefined = issues[0];
  const settingsUrl: string = buildSettingsUrl(firstIssue, returnTo);
  const capabilityName: string = featureName || CAPABILITY_NAMES[capability];
  const hasTranscriptionIssue: boolean = issues.some(
    (issue: CapabilityGateIssue): boolean => issue.label === '语音转文字',
  );
  return (
    <main className="flex min-h-screen items-center justify-center bg-[linear-gradient(135deg,#f4f7fb_0%,#eef3ff_100%)] p-6">
      <section className="w-full max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_70px_rgba(15,35,60,0.12)]">
        <div className="border-b border-slate-100 bg-slate-950 px-7 py-6 text-white sm:px-9">
          <div className="flex items-start gap-4">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-amber-300 text-amber-950">
              <AlertTriangle className="size-6" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-200">
                需要补充配置
              </p>
              <h1 className="mt-2 text-2xl font-semibold tracking-tight">
                {capabilityName}还不能开始
              </h1>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                完成下面的配置后返回，系统会自动重新检查当前入口。
              </p>
            </div>
          </div>
        </div>
        <div className="p-7 sm:p-9">
          <div className="grid gap-3">
            {issues.map(
              (issue: CapabilityGateIssue): ReactNode => (
                <div
                  className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                  key={issue.label}
                >
                  <p className="text-sm font-semibold text-slate-900">
                    需要配置：{issue.label}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-slate-600">
                    {issue.reason}
                  </p>
                </div>
              ),
            )}
          </div>
          {hasTranscriptionIssue && (
            <div className="mt-6 rounded-xl border border-blue-100 bg-blue-50/70 p-4 text-xs leading-5 text-blue-950">
              本地 Whisper
              模型是离线转录和云端失败时的兜底能力；如果已经配置腾讯云 ASR
              或兼容 API，就不需要再准备本地模型。
            </div>
          )}
          <div className="mt-7 flex flex-wrap justify-between gap-3">
            <Button asChild variant="ghost">
              <Link to="/">
                <ArrowLeft className="size-4" />
                返回工作台
              </Link>
            </Button>
            <Button asChild>
              <Link to={settingsUrl}>
                去参数配置
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>
    </main>
  );
}
