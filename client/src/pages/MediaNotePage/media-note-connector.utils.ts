import type { ConnectorType } from '@shared/api.interface';

export interface MediaNoteConnectorCopy {
  completionDescription: string;
  completionTitle: string;
  documentActionLabel: string;
  publishingLabel: string;
  successToast: string;
}

const CONNECTOR_COPY: Record<ConnectorType, MediaNoteConnectorCopy> = {
  local: {
    completionDescription: '请选择本地保存位置，导出 Markdown 学习笔记。',
    completionTitle: 'Markdown 文件已生成',
    documentActionLabel: '保存 Markdown 文件',
    publishingLabel: '保存 Markdown 文件',
    successToast: 'Markdown 学习笔记已生成',
  },
  feishu: {
    completionDescription: '现在可以打开并检查学习笔记。',
    completionTitle: '飞书文档创建成功',
    documentActionLabel: '打开飞书学习笔记',
    publishingLabel: '写入飞书',
    successToast: '飞书学习笔记已经创建，源文件已保留',
  },
  dingtalk: {
    completionDescription: '现在可以打开并检查学习笔记。',
    completionTitle: '钉钉文档创建成功',
    documentActionLabel: '打开钉钉学习笔记',
    publishingLabel: '写入钉钉',
    successToast: '钉钉学习笔记已经创建，源文件已保留',
  },
};

export function getMediaNoteConnectorCopy(
  connector: ConnectorType | undefined,
): MediaNoteConnectorCopy {
  return CONNECTOR_COPY[connector || 'feishu'];
}

export function toMarkdownFileName(sourceFileName?: string): string {
  const baseName = (sourceFileName || '学习笔记')
    .replace(/[\\/:*?"<>|]/gu, '-')
    .replace(/\.[^.]+$/u, '')
    .trim();
  return `${baseName || '学习笔记'}-学习笔记.md`;
}
