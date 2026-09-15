import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  HardDrive,
  LoaderCircle,
} from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { getConnectorSettings } from '@/api';
import ConnectorSettingsPage from '@/pages/ConnectorSettingsPage/ConnectorSettingsPage';
import { Button } from '@/components/ui/button';

interface SetupConnectorStepProps {
  onBack: () => void;
  onContinue: () => Promise<void>;
  onSkip: () => Promise<void>;
  working: boolean;
}

export default function SetupConnectorStep({
  onBack,
  onContinue,
  onSkip,
  working,
}: SetupConnectorStepProps): ReactElement {
  const [error, setError] = useState<string>('');
  const [destination, setDestination] = useState<'local' | 'external'>('local');

  const handleContinue = async (): Promise<void> => {
    setError('');
    try {
      const settings = await getConnectorSettings();
      const activeConnector = settings.items.find(
        (item) => item.type === settings.activeConnector,
      );
      if (activeConnector?.status !== 'ready') {
        setError('请先完成飞书或钉钉授权，并通过连接验证后再继续。');
        return;
      }
      await onContinue();
    } catch (nextError) {
      setError(
        nextError instanceof Error
          ? nextError.message
          : '无法读取连接器状态，请重试。',
      );
    }
  };

  return (
    <div>
      <div className="mb-7 flex items-start gap-4">
        <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-blue-50 text-blue-700">
          <CheckCircle2 className="size-6" />
        </div>
        <div>
          <p className="text-sm font-medium text-blue-700">
            第 6 步 · 选择笔记输出位置
          </p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight">
            笔记准备保存在哪里？
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            这一步不会再自动跳过。可以先保存到本机，也可以现在完成飞书或钉钉授权。
          </p>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          aria-pressed={destination === 'local'}
          className={`rounded-xl border p-4 text-left transition ${destination === 'local' ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500/20' : 'border-slate-200 hover:border-slate-300'}`}
          onClick={(): void => {
            setDestination('local');
            setError('');
          }}
          type="button"
        >
          <span className="flex items-center gap-2 text-sm font-medium">
            <HardDrive className="size-4 text-blue-600" />
            仅保存到本机
          </span>
          <span className="mt-2 block text-xs leading-5 text-slate-500">
            笔记和原始资料保存在本机，之后仍可在参数配置中接入协作平台。
          </span>
        </button>
        <button
          aria-pressed={destination === 'external'}
          className={`rounded-xl border p-4 text-left transition ${destination === 'external' ? 'border-blue-500 bg-blue-50 ring-1 ring-blue-500/20' : 'border-slate-200 hover:border-slate-300'}`}
          onClick={(): void => {
            setDestination('external');
            setError('');
          }}
          type="button"
        >
          <span className="flex items-center gap-2 text-sm font-medium">
            <CheckCircle2 className="size-4 text-blue-600" />
            同步到飞书或钉钉
          </span>
          <span className="mt-2 block text-xs leading-5 text-slate-500">
            本机保留一份，同时把结果发送到已授权并验证过的输出位置。
          </span>
        </button>
      </div>
      {destination === 'external' && (
        <div className="mt-6">
          <ConnectorSettingsPage embedded />
        </div>
      )}
      {error && (
        <p className="mt-5 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
      <div className="mt-8 flex justify-between gap-3">
        <Button
          data-ai-section-type="button"
          disabled={working}
          onClick={onBack}
          variant="ghost"
        >
          <ArrowLeft className="size-4" />
          返回
        </Button>
        <div className="flex flex-wrap justify-end gap-2">
          {destination === 'external' && (
            <Button
              data-ai-section-type="button"
              disabled={working}
              onClick={(): void => void onSkip()}
              variant="ghost"
            >
              仅保存本机
            </Button>
          )}
          <Button
            data-ai-section-type="button"
            disabled={working}
            onClick={(): void =>
              void (destination === 'local' ? onSkip() : handleContinue())
            }
          >
            {destination === 'local' ? '保存本机并继续' : '已授权并继续'}
            {working ? (
              <LoaderCircle className="size-4 animate-spin" />
            ) : (
              <ArrowRight className="size-4" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
