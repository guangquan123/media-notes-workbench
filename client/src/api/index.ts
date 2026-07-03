import { logger } from '@lark-apaas/client-toolkit/logger';
import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import type {
  ArticleArtifact,
  ArticleExportJob,
  ArticleExportReadiness,
  CreateArticleExportJobRequest,
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

export async function getArticleExportReadiness(): Promise<ArticleExportReadiness> {
  const response = await axiosForBackend({
    url: '/api/article-export/readiness',
    method: 'GET',
    timeout: 4000,
  });
  return response.data;
}

export async function createArticleExportJob(
  input: CreateArticleExportJobRequest,
): Promise<ArticleExportJob> {
  try {
    const response = await axiosForBackend({
      url: '/api/article-export',
      method: 'POST',
      data: input,
      timeout: 10000,
    });
    return response.data;
  } catch (error) {
    logger.error('创建文章导出任务失败', error);
    throw error;
  }
}

export async function getArticleExportJob(id: string): Promise<ArticleExportJob> {
  const response = await axiosForBackend({
    url: `/api/article-export/${id}`,
    method: 'GET',
    timeout: 5000,
  });
  return response.data;
}

export async function getArticleExportArtifact(
  id: string,
  platform: ArticleArtifact['platform'],
): Promise<ArticleArtifact> {
  const response = await axiosForBackend({
    url: `/api/article-export/${id}/artifacts/${platform}`,
    method: 'GET',
    timeout: 5000,
  });
  return response.data;
}
