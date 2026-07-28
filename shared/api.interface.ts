export type SourcePlatform = 'bilibili' | 'douyin';

export type NoteSourceType =
  | 'platform'
  | 'video'
  | 'audio'
  | 'document'
  | 'pdf';

export type NoteStyle = 'learning' | 'meeting';

export interface NoteTemplateConfig {
  activeVersionId?: string;
  activeVersionNumber?: number;
  content: string;
  description: string;
  draftContent: string;
  history: NotePromptVersion[];
  isDefault: boolean;
  label: string;
  publishedContent: string;
  style: NoteStyle;
  updatedAt?: string;
}

export interface NotePromptVersion {
  content: string;
  id: string;
  publishedAt: string;
  versionNumber: number;
}

export interface NoteTemplateConfigResponse {
  items: NoteTemplateConfig[];
}

export interface UpdateNoteTemplateConfigRequest {
  content: string;
}

export type JobStage =
  | 'queued'
  | 'uploading'
  | 'checking'
  | 'preparing'
  | 'parsing'
  | 'downloading'
  | 'transcribing'
  | 'extracting-frames'
  | 'uploading-frames'
  | 'analyzing-frames'
  | 'summarizing'
  | 'publishing'
  | 'completed'
  | 'failed';

export interface UploadedMediaInput {
  downloadUrl: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  parts?: UploadedMediaPart[];
}

export interface UploadedMediaPart {
  downloadUrl: string;
  fileSize: number;
}

export interface CreateNoteJobRequest {
  sourceType?: NoteSourceType;
  noteStyle?: NoteStyle;
  url?: string;
  sourcePlatform?: SourcePlatform;
  cookieBrowser?: 'chrome' | 'safari' | 'edge' | 'firefox';
  media?: UploadedMediaInput;
  mediaItems?: UploadedMediaInput[];
}

export interface ConfigureNoteInboxRequest {
  chatId: string;
  noteStyle: NoteStyle;
}

export interface NoteInboxStatus {
  chatId?: string;
  configured: boolean;
  lastError?: string;
  seenCount: number;
  lastSyncedAt?: string;
  summary?: NoteInboxSummary;
}

export type InboxMessageStatus = 'QUEUED' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED' | 'DUPLICATE' | 'IGNORED';
export interface NoteInboxSummary { totalMessages: number; succeeded: number; processing: number; queued: number; failed: number; duplicates: number; ignored: number; }
export interface NoteInboxMessage { id: string; messageId: string; subject: string; originalUrl: string | null; platform: SourcePlatform | null; status: InboxMessageStatus; statusReason: string | null; messageCreatedAt: string | null; duplicateOfMessageId: string | null; jobId: string | null; mediaTitle: string | null; }
export interface NoteInboxMessageListResponse { items: NoteInboxMessage[]; summary: NoteInboxSummary; }

export interface NoteJob {
  id: string;
  stage: JobStage;
  progress: number;
  message: string;
  sourceType: NoteSourceType;
  sourcePlatform?: SourcePlatform;
  sourceLabel: string;
  mediaFileName?: string;
  fileHash?: string;
  pageCount?: number;
  parseQuality?: 'parsed' | 'needs_ocr' | 'needs_review';
  videoTitle?: string;
  rawDocumentUrl?: string;
  documentUrl?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SystemReadiness {
  ytDlp: boolean;
  ffmpeg: boolean;
  whisperCli: boolean;
  whisperModel: boolean;
  larkCli: boolean;
  ready: boolean;
  platformReady: boolean;
  mediaReady: boolean;
  documentReady: boolean;
  /** @deprecated 旧客户端兼容字段，请使用 documentReady。 */
  pdfReady: boolean;
}

export type ConversionStatus = 'processing' | 'completed' | 'failed';
export type NoteProcessingStatus = 'pending' | 'processed';
export type TaskSyncStatus = 'not_created' | 'created' | 'failed';

export interface NoteConversionRecord {
  id: string;
  jobId: string;
  title: string;
  sourceType: NoteSourceType;
  sourceLabel: string;
  status: ConversionStatus;
  durationMs: number | null;
  durationLabel: string;
  startedAt: string;
  completedAt: string | null;
  rawDocumentUrl: string | null;
  rawTranscriptAvailable: boolean;
  documentUrl: string | null;
  noteStyle: NoteStyle | null;
  promptContent: string | null;
  promptVersionId: string | null;
  processingStatus: NoteProcessingStatus;
  processedAt: string | null;
  larkTaskGuid: string | null;
  larkTaskUrl: string | null;
  taskSyncStatus: TaskSyncStatus;
  taskSyncError: string | null;
}

export interface NoteConversionHistoryResponse {
  items: NoteConversionRecord[];
  pagination: NoteConversionHistoryPagination;
}

export interface NoteConversionHistoryPagination {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface NoteConversionHistoryQuery {
  jobId?: string;
  sourceChannel?: 'feishu_inbox' | 'manual';
  dateFrom?: string;
  dateTo?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
  processingStatus?: NoteProcessingStatus;
  sourceType?: NoteSourceType;
  status?: ConversionStatus;
}

export interface MarkNoteProcessedResponse {
  processedAt: string;
}

export interface MarkNoteProcessedBatchRequest {
  jobIds: string[];
}

export interface MarkNoteProcessedBatchResponse {
  failed: Array<{ jobId: string; message: string }>;
  processedJobIds: string[];
  skippedJobIds: string[];
}

export type ArticlePlatform = 'source' | 'wechat' | 'zhihu' | 'douyin';

export type ArticleExportStage =
  | 'queued'
  | 'checking'
  | 'fetching'
  | 'normalizing'
  | 'rendering'
  | 'completed'
  | 'failed';

export type ArticleExportStyle = 'editorial' | 'concise';

export type ArticleExportFormat = 'html' | 'markdown' | 'txt';

export interface CreateArticleExportJobRequest {
  sourceDocUrl: string;
  targetPlatforms: Exclude<ArticlePlatform, 'source'>[];
  includeImages?: boolean;
  preferredStyle?: ArticleExportStyle;
}

export interface ArticleArtifact {
  platform: ArticlePlatform;
  format: ArticleExportFormat;
  copyContent: string;
  downloadFileName: string;
  previewHtml?: string;
  unsupportedBlocks: string[];
}

export interface ArticleExportJob {
  id: string;
  stage: ArticleExportStage;
  progress: number;
  message: string;
  sourceTitle?: string;
  sourceDocUrl: string;
  targetPlatforms: Exclude<ArticlePlatform, 'source'>[];
  artifacts: ArticleArtifact[];
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ArticleExportReadiness {
  larkCli: boolean;
  larkAuth: boolean;
  ready: boolean;
}
