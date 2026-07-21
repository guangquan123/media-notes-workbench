import { logger } from '@lark-apaas/client-toolkit/logger';
import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import type {
  ArticleArtifact,
  ArticleExportJob,
  ArticleExportReadiness,
  CreateArticleExportJobRequest,
  CreateNoteJobRequest,
  ConfigureNoteInboxRequest,
  MarkNoteProcessedBatchRequest,
  MarkNoteProcessedBatchResponse,
  MarkNoteProcessedResponse,
  NoteConversionHistoryQuery,
  NoteConversionHistoryResponse,
  NoteJob,
  NoteInboxStatus,
  NoteInboxMessageListResponse,
  NoteStyle,
  NoteTemplateConfig,
  NoteTemplateConfigResponse,
  SystemReadiness,
  UpdateNoteTemplateConfigRequest,
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

export async function createNoteJob(
  input: CreateNoteJobRequest,
): Promise<NoteJob> {
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

export async function getNoteInboxStatus(): Promise<NoteInboxStatus> {
  const response = await axiosForBackend({
    url: '/api/note-inbox',
    method: 'GET',
    timeout: JOB_READ_TIMEOUT_MS,
  });
  return response.data;
}

export async function configureNoteInbox(
  input: ConfigureNoteInboxRequest,
): Promise<NoteInboxStatus> {
  const response = await axiosForBackend({
    url: '/api/note-inbox/configure',
    method: 'POST',
    data: input,
    timeout: JOB_WRITE_TIMEOUT_MS,
  });
  return response.data;
}

export async function syncNoteInbox(): Promise<NoteInboxStatus> {
  const response = await axiosForBackend({
    url: '/api/note-inbox/sync',
    method: 'POST',
    timeout: JOB_WRITE_TIMEOUT_MS,
  });
  return response.data;
}

export async function getNoteInboxMessages(): Promise<NoteInboxMessageListResponse> {
  const response = await axiosForBackend({ url: '/api/note-inbox/messages', method: 'GET', timeout: JOB_READ_TIMEOUT_MS });
  return response.data;
}

export async function getNoteJob(id: string): Promise<NoteJob> {
  const response = await axiosForBackend({
    url: `/api/note-jobs/${id}`,
    method: 'GET',
    timeout: JOB_READ_TIMEOUT_MS,
  });
  return response.data;
}

export async function getNoteConversionHistory(
  query: NoteConversionHistoryQuery,
): Promise<NoteConversionHistoryResponse> {
  const response = await axiosForBackend({
    url: '/api/note-jobs/history',
    method: 'GET',
    params: query,
    timeout: JOB_READ_TIMEOUT_MS,
  });
  return response.data;
}

export async function markNoteProcessedBatch(
  input: MarkNoteProcessedBatchRequest,
): Promise<MarkNoteProcessedBatchResponse> {
  const response = await axiosForBackend({
    url: '/api/note-jobs/history/mark-processed',
    method: 'POST',
    data: input,
    timeout: JOB_WRITE_TIMEOUT_MS,
  });
  return response.data;
}

export async function downloadRawTranscript(jobId: string): Promise<Blob> {
  const response = await axiosForBackend({
    url: `/api/note-jobs/history/${jobId}/raw-transcript`,
    method: 'GET',
    responseType: 'blob',
    timeout: JOB_READ_TIMEOUT_MS,
  });
  return response.data;
}

export async function markNoteProcessed(
  jobId: string,
): Promise<MarkNoteProcessedResponse> {
  const response = await axiosForBackend({
    url: `/api/note-jobs/history/${jobId}/mark-processed`,
    method: 'POST',
    timeout: JOB_WRITE_TIMEOUT_MS,
  });
  return response.data;
}

export async function getNoteTemplates(): Promise<NoteTemplateConfigResponse> {
  const response = await axiosForBackend({
    url: '/api/note-jobs/templates',
    method: 'GET',
    timeout: JOB_READ_TIMEOUT_MS,
  });
  return response.data;
}

export async function updateNoteTemplate(
  style: NoteStyle,
  input: UpdateNoteTemplateConfigRequest,
): Promise<NoteTemplateConfig> {
  const response = await axiosForBackend({
    url: `/api/note-jobs/templates/${style}`,
    method: 'PUT',
    data: input,
    timeout: JOB_WRITE_TIMEOUT_MS,
  });
  return response.data;
}

export async function publishNoteTemplate(
  style: NoteStyle,
): Promise<NoteTemplateConfig> {
  const response = await axiosForBackend({
    url: `/api/note-jobs/templates/${style}/publish`,
    method: 'POST',
    timeout: JOB_WRITE_TIMEOUT_MS,
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

export async function getArticleExportJob(
  id: string,
): Promise<ArticleExportJob> {
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
