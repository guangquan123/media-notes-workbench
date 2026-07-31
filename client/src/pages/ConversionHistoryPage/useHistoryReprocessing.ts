import { useRef, useState } from 'react';
import { toast } from 'sonner';

import {
  confirmDeletedSourceObjects,
  getNoteSourceSnapshot,
  regenerateNote,
  regenerateRawDocument,
  reprocessNote,
} from '@/api';
import {
  createSignedUrlsForStoredSourceObjects,
  deleteStoredSourceObjects,
} from '@/components/business-ui/api/files/service';
import type {
  NoteConversionRecord,
  NoteVisualOptions,
} from '@shared/api.interface';
import {
  listRetainedSourceObjects,
  materializeRetainedNoteSource,
} from '@shared/note-reprocessing.utils';
import {
  getRequestErrorMessage,
  SingleFlightGuard,
} from './history-reprocessing.utils';

interface UseHistoryReprocessingInput {
  onRecordsChanged: () => Promise<void>;
}

export function useHistoryReprocessing({
  onRecordsChanged,
}: UseHistoryReprocessingInput) {
  const [actionJobId, setActionJobId] = useState<string | null>(null);
  const [sourceToDelete, setSourceToDelete] =
    useState<NoteConversionRecord | null>(null);
  const [deletingSource, setDeletingSource] = useState(false);
  const imageReprocessGuard = useRef(new SingleFlightGuard());

  const regenerateRaw = async (record: NoteConversionRecord) => {
    setActionJobId(record.jobId);
    try {
      await regenerateRawDocument(record.jobId);
      await onRecordsChanged();
      toast.success('原文已重新生成');
    } catch {
      toast.error('原文重新生成失败，请稍后重试');
    } finally {
      setActionJobId(null);
    }
  };

  const regenerateSummary = async (record: NoteConversionRecord) => {
    setActionJobId(record.jobId);
    try {
      await regenerateNote(record.jobId);
      await onRecordsChanged();
      toast.success('已创建新的笔记版本，正在后台生成');
    } catch {
      toast.error('笔记重新生成失败，请稍后重试');
    } finally {
      setActionJobId(null);
    }
  };

  const reprocessWithRetainedSource = async (
    record: NoteConversionRecord,
    successMessage: string,
  ) => {
    setActionJobId(record.jobId);
    try {
      const snapshot = await getNoteSourceSnapshot(record.jobId);
      if (!snapshot.source) throw new Error('源文件已不可用');
      const objects = listRetainedSourceObjects(snapshot.source);
      const signedUrls =
        objects.length > 0
          ? await createSignedUrlsForStoredSourceObjects(objects)
          : {};
      const input = materializeRetainedNoteSource(snapshot.source, signedUrls);
      await reprocessNote(record.jobId, input);
      await onRecordsChanged();
      toast.success(successMessage);
    } catch {
      toast.error('完整重新处理失败，请检查源文件后重试');
    } finally {
      setActionJobId(null);
    }
  };

  const fullyReprocess = async (record: NoteConversionRecord) =>
    reprocessWithRetainedSource(record, '已创建完整重跑版本，正在后台处理');

  const reprocessImages = async (
    record: NoteConversionRecord,
    visualOptions: NoteVisualOptions,
  ) => {
    if (!imageReprocessGuard.current.tryAcquire(record.jobId)) {
      toast.message('图片重处理任务正在创建，请勿重复提交');
      return;
    }
    setActionJobId(record.jobId);
    try {
      const originalSnapshot = await getNoteSourceSnapshot(record.jobId);
      if (!originalSnapshot.source) {
        throw new Error('源文件已不可用，请重新上传后再处理图片');
      }
      const objects = listRetainedSourceObjects(originalSnapshot.source);
      const signedUrls =
        objects.length > 0
          ? await createSignedUrlsForStoredSourceObjects(objects)
          : {};
      const input = materializeRetainedNoteSource(
        originalSnapshot.source,
        signedUrls,
      );
      input.visualOptions = visualOptions;
      await reprocessNote(record.jobId, input);
      await onRecordsChanged();
      toast.success('已创建图片重处理版本，正在重新抽帧和识别');
    } catch (error: unknown) {
      toast.error(
        getRequestErrorMessage(error, '图片重新处理失败，请检查源文件后重试'),
      );
    } finally {
      imageReprocessGuard.current.release(record.jobId);
      setActionJobId(null);
    }
  };

  const deleteRetainedSource = async () => {
    const record: NoteConversionRecord | null = sourceToDelete;
    if (!record) return;
    setDeletingSource(true);
    try {
      const snapshot = await getNoteSourceSnapshot(record.jobId);
      if (snapshot.inUse) {
        toast.error('该源文件仍有处理任务在运行，完成后才能删除');
        return;
      }
      const objects = listRetainedSourceObjects(snapshot.source);
      if (objects.length === 0) {
        toast.message('源文件已经删除，无需重复操作');
        return;
      }
      const deletion = await deleteStoredSourceObjects(objects);
      if (deletion.deletedObjectIds.length > 0) {
        await confirmDeletedSourceObjects(record.jobId, {
          objectIds: deletion.deletedObjectIds,
        });
      }
      await onRecordsChanged();
      if (deletion.failures.length > 0) {
        toast.error(
          `已删除 ${deletion.deletedObjectIds.length} 个对象，仍有 ${deletion.failures.length} 个删除失败`,
        );
      } else {
        toast.success('源文件已永久删除，原文和笔记仍会保留');
      }
    } catch {
      toast.error('源文件删除失败，请稍后重试');
    } finally {
      setDeletingSource(false);
      setSourceToDelete(null);
    }
  };

  return {
    actionJobId,
    deleteRetainedSource,
    deletingSource,
    fullyReprocess,
    reprocessImages,
    regenerateRaw,
    regenerateSummary,
    setSourceToDelete,
    sourceToDelete,
  };
}
