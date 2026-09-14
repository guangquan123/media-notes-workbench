import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  LoaderCircle,
} from 'lucide-react';
import { useState, type ReactElement } from 'react';
import { getConnectorSettings } from '@/api';
import ConnectorSettingsPage from '@/pages/ConnectorSettingsPage/ConnectorSettingsPage';
import { Button } from '@/components/ui/button';

interface SetupConnectorStepProps {
  onBack: () => void;
  onContinue: () => Promise<void>;
  working: boolean;
}

export default function SetupConnectorStep({
  onBack,
  onContinue,
  working,
}: SetupConnectorStepProps): ReactElement {
  const [error, setError] = useState<string>('');

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
            连接飞书或钉钉
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">
            笔记会保存在本机，同时发送到你选择并验证过的唯一输出位置。
          </p>
        </div>
      </div>
      <ConnectorSettingsPage embedded />
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
        <Button
          data-ai-section-type="button"
          disabled={working}
          onClick={(): void => void handleContinue()}
        >
          已授权并继续
          {working ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <ArrowRight className="size-4" />
          )}
        </Button>
      </div>
    </div>
  );
}
