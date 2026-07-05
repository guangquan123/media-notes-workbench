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

interface CachedRequestState<T> {
  promise: Promise<T> | null;
  resolvedAt: number;
  value: T | null;
}

const READINESS_TIMEOUT_MS = 12000;
const JOB_READ_TIMEOUT_MS = 8000;
const JOB_WRITE_TIMEOUT_MS = 15000;
const READINESS_CACHE_TTL_MS = 30000;

function createCachedRequestState<T>(): CachedRequestState<T> {
  return {
    promise: null,
    resolvedAt: 0,
    value: null,
  };
}

async function requestWithCache<T>(
  state: CachedRequestState<T>,
  request: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  if (state.value && now - state.resolvedAt < READINESS_CACHE_TTL_MS) {
    return state.value;
  }
  if (state.promise) {
    return state.promise;
  }

  state.promise = request()
    .then((value: T) => {
      state.value = value;
      state.resolvedAt = Date.now();
      return value;
    })
    .finally(() => {
      state.promise = null;
    });

  return state.promise;
}

const noteJobsReadinessState = createCachedRequestState<SystemReadiness>();
const articleExportReadinessState =
  createCachedRequestState<ArticleExportReadiness>();

export async function getReadiness(): Promise<SystemReadiness> {
  return requestWithCache(noteJobsReadinessState, async () => {
    const response = await axiosForBackend({
      url: '/api/note-jobs/readiness',
      method: 'GET',
      timeout: READINESS_TIMEOUT_MS,
    });
    return response.data;
  });
}

export async function createNoteJob(input: CreateNoteJobRequest): Promise<NoteJob> {
  try {
    const response = await axiosForBackend({
      url: '/api/note-jobs',
      method: 'POST',
      data: input,
      timeout: JOB_WRITE_TIMEOUT_MS,
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
    timeout: JOB_READ_TIMEOUT_MS,
  });
  return response.data;
}

export async function getArticleExportReadiness(): Promise<ArticleExportReadiness> {
  return requestWithCache(articleExportReadinessState, async () => {
    const response = await axiosForBackend({
      url: '/api/article-export/readiness',
      method: 'GET',
      timeout: READINESS_TIMEOUT_MS,
    });
    return response.data;
  });
}

export async function createArticleExportJob(
  input: CreateArticleExportJobRequest,
): Promise<ArticleExportJob> {
  try {
    const response = await axiosForBackend({
      url: '/api/article-export',
      method: 'POST',
      data: input,
      timeout: JOB_WRITE_TIMEOUT_MS,
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
    timeout: JOB_READ_TIMEOUT_MS,
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
    timeout: JOB_READ_TIMEOUT_MS,
  });
  return response.data;
}
