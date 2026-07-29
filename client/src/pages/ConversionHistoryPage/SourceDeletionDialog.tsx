import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { NoteConversionRecord } from '@shared/api.interface';

interface SourceDeletionDialogProps {
  deleting: boolean;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  record: NoteConversionRecord | null;
}

export function SourceDeletionDialog({
  deleting,
  onConfirm,
  onOpenChange,
  record,
}: SourceDeletionDialogProps) {
  return (
    <AlertDialog onOpenChange={onOpenChange} open={Boolean(record)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>确认删除保留的源文件？</AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            <span className="block">
              将永久删除“{record?.title || '这条记录'}”对应的
              {record?.sourceAssets.objectCount || 0} 个存储对象。
            </span>
            <span className="block">
              已生成的原文和笔记仍会保留，但此后不能再执行完整重新处理。此操作不可恢复。
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
          <AlertDialogAction
            className="bg-red-600 text-white hover:bg-red-700"
            disabled={deleting}
            onClick={onConfirm}
          >
            {deleting ? '正在删除' : '永久删除源文件'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
