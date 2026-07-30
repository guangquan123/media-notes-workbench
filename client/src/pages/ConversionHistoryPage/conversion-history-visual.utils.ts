import type { NoteVisualOptions } from '@shared/api.interface';

interface VisualOptionsCopy {
  detail: string;
  enabled: boolean;
  title: string;
}

const densityLabels: Record<
  Exclude<NoteVisualOptions['mode'], 'disabled'> extends never
    ? never
    : 'compact' | 'standard' | 'detailed',
  string
> = {
  compact: '精简截图',
  detailed: '详细截图',
  standard: '标准截图',
};

const outputModeLabels: Record<
  'original' | 'original_with_ai_notes' | 'original_with_ai_derivative',
  string
> = {
  original: '仅原始截图',
  original_with_ai_derivative: '原图 + AI 派生图',
  original_with_ai_notes: '原图 + AI 文字识别',
};

export function getVisualOptionsCopy(
  visualOptions: NoteVisualOptions | undefined,
): VisualOptionsCopy {
  if (!visualOptions || visualOptions.mode === 'disabled') {
    return {
      detail: '本次任务未请求视频图片处理',
      enabled: false,
      title: '未启用关键画面',
    };
  }
  return {
    detail: [
      densityLabels[visualOptions.density],
      outputModeLabels[visualOptions.outputMode],
      visualOptions.mode === 'automatic' ? '自动发布' : '人工确认后发布',
      visualOptions.allowExternalAi ? '已允许外部 AI' : '未允许外部 AI',
    ].join(' · '),
    enabled: true,
    title: '已启用关键画面',
  };
}
