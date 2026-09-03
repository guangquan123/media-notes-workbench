import type { SummaryGenerationInfo } from '@shared/api.interface';

export interface QualityWarningCopy {
  reasons: string[];
  score: number;
}

export function getQualityWarningCopy(
  summaryGeneration?: SummaryGenerationInfo,
): QualityWarningCopy | null {
  const score: number | undefined = summaryGeneration?.qualityScore;
  if (typeof score !== 'number' || score >= 90) return null;

  const reasons: string[] = (summaryGeneration?.qualityWarnings || [])
    .filter((warning: string): boolean => Boolean(warning.trim()))
    .slice(0, 4);
  if (reasons.length === 0) {
    reasons.push(
      '系统未返回更细分的预警项，请重点核对原文覆盖度、证据引用和数字信息。',
    );
  }
  return { reasons, score };
}
