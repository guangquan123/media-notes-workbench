import {
  BrainCircuit,
  CheckCircle2,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import type { NoteJob, SummaryGenerationStage } from '@shared/api.interface';

interface SummaryModelProgressProps {
  job: NoteJob;
}

const STAGE_COPY: Record<SummaryGenerationStage, string> = {
  preparing: '正在准备可追溯的原文与提示词',
  generating: '正在根据原文生成笔记初稿',
  extracting: '正在逐段提取数字、原话、案例、风险与待办证据',
  structuring: '证据账本已完成，正在组织高密度笔记',
  reviewing: '初稿完成，正在核验与原文的一致性',
  repairing: '质量门禁发现遗漏，正在定向修订',
  completed: '笔记已完成并写入文档',
  fallback: '外部模型不可用，已切换到内置模型继续生成',
};

export function SummaryModelProgress({ job }: SummaryModelProgressProps) {
  const summary = job.summaryGeneration;
  if (!summary) return null;
  const Icon =
    summary.stage === 'completed'
      ? CheckCircle2
      : summary.stage === 'reviewing'
        ? ShieldCheck
        : summary.provider === 'external_model'
          ? BrainCircuit
          : Sparkles;
  const qualityCopy: string =
    summary.qualityScore === undefined
      ? ''
      : ` 当前质量门禁：${summary.qualityScore} 分。`;
  return (
    <div className="mt-5 rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-950">
      <div className="flex items-center gap-2 font-semibold">
        <Icon className="size-4 text-violet-700" />
        总结模型：{summary.modelName}
      </div>
      <p className="mt-1 text-xs leading-5 text-violet-900/75">
        {STAGE_COPY[summary.stage]}。{qualityCopy}
        这里展示的是可验证的处理阶段，不包含模型内部推理内容。
      </p>
    </div>
  );
}
