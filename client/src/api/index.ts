import { logger as platformLogger } from '@lark-apaas/client-toolkit/logger';
import { axiosForBackend as platformAxiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import { axiosForBackend as localAxiosForBackend, logger as localLogger } from '@/lib/local-http';
import { isLocalRuntime } from '@/lib/runtime';

export const axiosForBackend: any = isLocalRuntime() ? localAxiosForBackend : platformAxiosForBackend;
export const logger: any = isLocalRuntime() ? localLogger : platformLogger;
import type {
  ArticleArtifact,
  ArticleExportJob,
  ArticleExportReadiness,
  CreateArticleExportJobRequest,
  CreateNoteJobRequest,
  ConfigureNoteInboxRequest,
  ConfirmDeletedSourceObjectsRequest,
  MarkNoteProcessedBatchRequest,
  MarkNoteProcessedBatchResponse,
  MarkNoteProcessedResponse,
  NoteConversionHistoryQuery,
  NoteConversionHistoryResponse,
  NoteJob,
  NoteSourceSnapshotResponse,
  NoteInboxStatus,
  NoteInboxMessageListResponse,
  NoteStyle,
  NoteTemplateConfig,
  NoteTemplateConfigResponse,
  SystemReadiness,
  TencentAsrSettings,
  TencentAsrConnectionStatus,
  ExternalModelConnectionStatus,
  ExternalModelSettings,
  CreateTaskNotificationWebhookRequest,
  TaskNotificationConnectionStatus,
  TaskNotificationSettings,
  UpdateTaskNotificationWebhookRequest,
  UpdateTencentAsrSettingsRequest,
  UpdateNoteTemplateConfigRequest,
  UpdateExternalModelSettingsRequest,
  GenerateFrameDerivativeRequest,
  NoteJobFrameListResponse,
  PublishFrameSelectionRequest,
  UpdateFrameSelectionRequest,
  UpdateFrameSelectionResponse,
  RegenerateRawDocumentResponse,
  ConnectorSettingsResponse,
  ConnectorTestResponse,
  ConnectorType,
  UpdateConnectorRequest,
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

export async function getTencentAsrSettings(): Promise<TencentAsrSettings> {
  const response = await axiosForBackend({
    url: '/api/note-jobs/transcription-settings',
    method: 'GET',
    timeout: JOB_READ_TIMEOUT_MS,
  });
  return response.data;
}

export async function updateTencentAsrSettings(
  input: UpdateTencentAsrSettingsRequest,
): Promise<TencentAsrSettings> {
  const response = await axiosForBackend({
    url: '/api/note-jobs/transcription-settings',
    method: 'PUT',
    data: input,
    timeout: JOB_WRITE_TIMEOUT_MS,
  });
  return response.data;
}

export async function testTencentAsrConnection(): Promise<TencentAsrConnectionStatus> {
  const response = await axiosForBackend({
    url: '/api/note-jobs/transcription-settings/test-connection',
    method: 'POST',
    timeout: JOB_WRITE_TIMEOUT_MS,
  });
  return response.data;
}

export async function getExternalModelSettings(): Promise<ExternalModelSettings> {
  const response = await axiosForBackend({
    url: '/api/note-jobs/model-settings',
    method: 'GET',
    timeout: JOB_READ_TIMEOUT_MS,
  });
  return response.data;
}

export async function updateExternalModelSettings(
  input: UpdateExternalModelSettingsRequest,
): Promise<ExternalModelSettings> {
  const response = await axiosForBackend({
    url: '/api/note-jobs/model-settings',
    method: 'PUT',
    data: input,
    timeout: JOB_WRITE_TIMEOUT_MS,
  });
  return response.data;
}

export async function testExternalModelConnection(): Promise<ExternalModelConnectionStatus> {
  const response = await axiosForBackend({
    url: '/api/note-jobs/model-settings/test-connection',
    method: 'POST',
    timeout: 30_000,
  });
  return response.data;
}

export async function getTaskNotificationSettings(): Promise<TaskNotificationSettings> {
  const response = await axiosForBackend({
    url: '/api/task-notifications',
    method: 'GET',
    timeout: JOB_READ_TIMEOUT_MS,
  });
  return response.data;
}

export async function createTaskNotificationWebhook(
  input: CreateTaskNotificationWebhookRequest,
): Promise<TaskNotificationSettings> {
  const response = await axiosForBackend({
    url: '/api/task-notifications/webhooks',
    method: 'POST',
    data: input,
    timeout: JOB_WRITE_TIMEOUT_MS,
  });
  return response.data;
}

export async function updateTaskNotificationWebhook(
  id: string,
  input: UpdateTaskNotificationWebhookRequest,
): Promise<TaskNotificationSettings> {
  const response = await axiosForBackend({
    url: `/api/task-notifications/webhooks/${id}`,
    method: 'PUT',
    data: input,
    timeout: JOB_WRITE_TIMEOUT_MS,
  });
  return response.data;
}

export async function deleteTaskNotificationWebhook(
  id: string,
): Promise<TaskNotificationSettings> {
  const response = await axiosForBackend({
    url: `/api/task-notifications/webhooks/${id}`,
    method: 'DELETE',
    timeout: JOB_WRITE_TIMEOUT_MS,
  });
  return response.data;
}

export async function testTaskNotificationWebhook(
  input: CreateTaskNotificationWebhookRequest,
): Promise<TaskNotificationConnectionStatus> {
  const response = await axiosForBackend({
    url: '/api/task-notifications/webhooks/test',
    method: 'POST',
    data: input,
    timeout: JOB_WRITE_TIMEOUT_MS,
  });
  return response.data;
}

export async function testSavedTaskNotificationWebhook(
  id: string,
): Promise<TaskNotificationConnectionStatus> {
  const response = await axiosForBackend({
    url: `/api/task-notifications/webhooks/${id}/test`,
    method: 'POST',
    timeout: JOB_WRITE_TIMEOUT_MS,
  });
  return response.data;
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

export async function cancelNoteJob(id: string): Promise<NoteJob> {
  const response = await axiosForBackend({
    url: `/api/note-jobs/${id}/cancel`,
    method: 'POST',
    timeout: JOB_WRITE_TIMEOUT_MS,
  });
  return response.data;
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
  const response = await axiosForBackend({
    url: '/api/note-inbox/messages',
    method: 'GET',
    timeout: JOB_READ_TIMEOUT_MS,
  });
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

export async function getNoteJobFrames(
  id: string,
  page = 1,
  pageSize = 1_000,
): Promise<NoteJobFrameListResponse> {
  const response = await axiosForBackend({
    url: `/api/note-jobs/${id}/frames`,
    method: 'GET',
    params: { page, pageSize },
    timeout: JOB_READ_TIMEOUT_MS,
  });
  return response.data;
}

export async function updateNoteJobFrameSelection(
  id: string,
  input: UpdateFrameSelectionRequest,
): Promise<UpdateFrameSelectionResponse> {
  const response = await axiosForBackend({
    url: `/api/note-jobs/${id}/frame-selection`,
    method: 'PUT',
    data: input,
    timeout: JOB_WRITE_TIMEOUT_MS,
  });
  return response.data;
}

export async function generateNoteJobFrameDerivative(
  id: string,
  frameId: string,
  input: GenerateFrameDerivativeRequest = {},
): Promise<{ derivativeUrl: string }> {
  const response = await axiosForBackend({
    url: `/api/note-jobs/${id}/frames/${frameId}/derivative`,
    method: 'PUT',
    data: input,
    timeout: 120_000,
  });
  return response.data;
}

export async function publishNoteJobFrameSelection(
  id: string,
  input: PublishFrameSelectionRequest,
): Promise<NoteJob> {
  const response = await axiosForBackend({
    url: `/api/note-jobs/${id}/publication`,
    method: 'PUT',
    data: input,
    timeout: 120_000,
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

export async function getNoteSourceSnapshot(
  jobId: string,
): Promise<NoteSourceSnapshotResponse> {
  const response = await axiosForBackend({
    url: `/api/note-jobs/history/${jobId}/source`,
    method: 'GET',
    timeout: JOB_READ_TIMEOUT_MS,
  });
  return response.data;
}

export async function confirmDeletedSourceObjects(
  jobId: string,
  input: ConfirmDeletedSourceObjectsRequest,
): Promise<NoteSourceSnapshotResponse> {
  const response = await axiosForBackend({
    url: `/api/note-jobs/history/${jobId}/source-assets/deleted`,
    method: 'POST',
    data: input,
    timeout: JOB_WRITE_TIMEOUT_MS,
  });
  return response.data;
}

export async function regenerateRawDocument(
  jobId: string,
): Promise<RegenerateRawDocumentResponse> {
  const response = await axiosForBackend({
    url: `/api/note-jobs/history/${jobId}/regenerate-raw`,
    method: 'POST',
    timeout: 120_000,
  });
  return response.data;
}

export async function regenerateNote(jobId: string): Promise<NoteJob> {
  const response = await axiosForBackend({
    url: `/api/note-jobs/history/${jobId}/regenerate-note`,
    method: 'POST',
    timeout: JOB_WRITE_TIMEOUT_MS,
  });
  return response.data;
}

export async function reprocessNote(
  jobId: string,
  input: CreateNoteJobRequest,
): Promise<NoteJob> {
  const response = await axiosForBackend({
    url: `/api/note-jobs/history/${jobId}/reprocess`,
    method: 'POST',
    data: input,
    timeout: JOB_WRITE_TIMEOUT_MS,
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

export async function getConnectorSettings(): Promise<ConnectorSettingsResponse> {
  const response = await axiosForBackend({
    url: '/api/connectors',
    method: 'GET',
    timeout: READINESS_TIMEOUT_MS,
  });
  return response.data;
}

export async function updateConnectorConfig(
  type: ConnectorType,
  input: UpdateConnectorRequest,
): Promise<ConnectorSettingsResponse> {
  const response = await axiosForBackend({
    url: `/api/connectors/${type}/config`,
    method: 'PUT',
    data: input,
    timeout: JOB_WRITE_TIMEOUT_MS,
  });
  return response.data;
}

export async function setActiveConnector(
  connector: ConnectorType,
): Promise<ConnectorSettingsResponse> {
  const response = await axiosForBackend({
    url: '/api/connectors/active',
    method: 'PUT',
    data: { connector },
    timeout: JOB_WRITE_TIMEOUT_MS,
  });
  return response.data;
}

export async function testConnector(
  connector: ConnectorType,
): Promise<ConnectorTestResponse> {
  const response = await axiosForBackend({
    url: `/api/connectors/${connector}/test`,
    method: 'POST',
    timeout: JOB_WRITE_TIMEOUT_MS,
  });
  return response.data;
}

export interface FeishuAuthInitiate {
  deviceCode: string;
  verificationUrl: string;
  expiresIn: number;
}

export interface FeishuAuthComplete {
  completed: boolean;
  message: string;
}

export async function initiateFeishuAuth(): Promise<FeishuAuthInitiate> {
  const response = await axiosForBackend({
    url: '/api/connectors/feishu/auth/initiate',
    method: 'POST',
    timeout: JOB_WRITE_TIMEOUT_MS,
  });
  return response.data;
}

export async function completeFeishuAuth(deviceCode: string): Promise<FeishuAuthComplete> {
  const response = await axiosForBackend({
    url: '/api/connectors/feishu/auth/complete',
    method: 'POST',
    data: { deviceCode },
    timeout: 30000,
  });
  return response.data;
}

export interface DingTalkAuthInitiate {
  verificationUrl: string;
  userCode: string;
  expiresIn: number;
}

export async function initiateDingTalkAuth(): Promise<DingTalkAuthInitiate> {
  const response = await axiosForBackend({
    url: '/api/connectors/dingtalk/auth/initiate',
    method: 'POST',
    timeout: 35000,
  });
  return response.data;
}

export async function completeDingTalkAuth(): Promise<{ completed: boolean; message: string }> {
  const response = await axiosForBackend({
    url: '/api/connectors/dingtalk/auth/complete',
    method: 'POST',
    timeout: 30000,
  });
  return response.data;
}
