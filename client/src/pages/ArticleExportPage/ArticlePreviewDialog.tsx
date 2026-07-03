import { Clipboard, Download } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { ArticleArtifact } from '@shared/api.interface';

interface ArticlePreviewDialogProps {
  artifact: ArticleArtifact | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCopy: (artifact: ArticleArtifact) => Promise<void>;
  onDownload: (artifact: ArticleArtifact) => void;
}

interface ArticlePreviewContentProps {
  artifact: ArticleArtifact;
  className?: string;
}

const ArticlePreviewContent = ({
  artifact,
  className = '',
}: ArticlePreviewContentProps) => (
  <div
    className={`overflow-auto rounded-2xl border border-black/8 bg-white ${className}`}
  >
    {artifact.previewHtml ? (
      <div
        className="article-preview prose prose-slate max-w-none p-5 text-[15px] leading-8 md:p-8"
        dangerouslySetInnerHTML={{ __html: artifact.previewHtml }}
      />
    ) : (
      <pre className="whitespace-pre-wrap p-5 text-sm leading-7 text-black/78 md:p-8">
        {artifact.copyContent}
      </pre>
    )}
  </div>
);

const ArticlePreviewDialog = ({
  artifact,
  open,
  onOpenChange,
  onCopy,
  onDownload,
}: ArticlePreviewDialogProps) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="flex h-[92vh] w-[min(1100px,calc(100vw-2rem))] max-w-none grid-rows-[auto_minmax(0,1fr)] gap-4 overflow-hidden rounded-3xl border-black/10 bg-[#f5f1ea] p-5 md:p-7">
      <DialogHeader className="pr-10">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <DialogTitle className="text-xl tracking-tight">
              {artifact ? `${getPlatformLabel(artifact.platform)}稿件预览` : '稿件预览'}
            </DialogTitle>
            <DialogDescription className="mt-2">
              这是发布前的完整效果检查，关闭后仍可继续切换平台。
            </DialogDescription>
          </div>
          {artifact ? (
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">{artifact.format}</Badge>
              <Button
                onClick={() => void onCopy(artifact)}
                type="button"
                variant="outline"
                size="sm"
              >
                <Clipboard className="size-4" />
                复制
              </Button>
              <Button
                onClick={() => onDownload(artifact)}
                type="button"
                size="sm"
              >
                <Download className="size-4" />
                下载
              </Button>
            </div>
          ) : null}
        </div>
      </DialogHeader>

      {artifact ? (
        <ArticlePreviewContent artifact={artifact} className="min-h-0" />
      ) : (
        <div className="grid min-h-0 place-items-center rounded-2xl border border-dashed border-black/12 bg-white text-sm text-black/45">
          暂无可预览稿件
        </div>
      )}
    </DialogContent>
  </Dialog>
);

function getPlatformLabel(platform: ArticleArtifact['platform']): string {
  if (platform === 'source') return '原文';
  if (platform === 'wechat') return '微信公众号';
  if (platform === 'zhihu') return '知乎';
  return '抖音';
}

export { ArticlePreviewContent };
export default ArticlePreviewDialog;
