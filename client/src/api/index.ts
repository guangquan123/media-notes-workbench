import { logger } from '@lark-apaas/client-toolkit/logger';
import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import type {
  CreateNoteJobRequest,
  NoteJob,
  SystemReadiness,
} from '@shared/api.interface';


export async function getReadiness(): Promise<SystemReadiness> {
  const response = await axiosForBackend({
    url: '/api/note-jobs/readiness',
    method: 'GET',
    timeout: 4000,
  });
  return response.data;
}

export async function createNoteJob(input: CreateNoteJobRequest): Promise<NoteJob> {
  try {
    const response = await axiosForBackend({
      url: '/api/note-jobs',
      method: 'POST',
      data: input,
      timeout: 10000,
    });
    return response.data;
  } catch (error) {
    logger.error('创建学习笔记任务失败', error);
    throw error;
  }
}

export async function getNoteJob(id: string): Promise<NoteJob> {
  const response = await axiosForBackend({
    url: `/api/note-jobs/${id}`,
    method: 'GET',
    timeout: 5000,
  });
  return response.data;
}
