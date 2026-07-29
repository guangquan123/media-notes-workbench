import type { NoteSourceAssetSummary } from '@shared/api.interface';

export interface SourceAssetCapabilities {
  canDelete: boolean;
  canReprocess: boolean;
}

export function getSourceAssetCapabilities(
  summary: NoteSourceAssetSummary,
): SourceAssetCapabilities {
  return {
    canDelete:
      (summary.status === 'retained' || summary.status === 'partial') &&
      summary.objectCount > 0,
    canReprocess:
      summary.status === 'retained' || summary.status === 'remote',
  };
}

export function getSourceAssetCopy(
  summary: NoteSourceAssetSummary,
): string {
  if (summary.status === 'retained') {
    return `源文件已保留 · ${summary.objectCount} 个对象`;
  }
  if (summary.status === 'partial') {
    return `源文件删除不完整 · 剩余 ${summary.objectCount} 个对象`;
  }
  if (summary.status === 'deleted') return '源文件已删除';
  if (summary.status === 'remote') return '原链接可重新抓取';
  return '未保留可复用源文件';
}
