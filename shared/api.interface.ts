export type SourcePlatform = 'bilibili' | 'douyin';

export type NoteSourceType =
  | 'platform'
  | 'video'
  | 'audio'
  | 'paired'
  | 'document'
  | 'pdf';

export type NoteStyle = 'learning' | 'meeting';

export type ConnectorType = 'local' | 'feishu' | 'dingtalk';

export type ConnectorCapability =
  | 'document.read'
  | 'document.write'
  | 'document.media'
  | 'task.read'
  | 'task.write'
  | 'inbox.read'
  | 'notification.send'
  | 'identity.read';

export type ConnectorStatus = 'ready' | 'unconfigured' | 'disabled' | 'error';

export interface ConnectorDescriptor {
  capabilities: ConnectorCapability[];
  configured: boolean;
  enabled: boolean;
  label: string;
  lastCheckedAt?: string;
  lastError?: string;
  status: ConnectorStatus;
  type: ConnectorType;
}

export interface ConnectorSettingsResponse {
  activeConnector: ConnectorType;
  items: ConnectorDescriptor[];
}

export interface UpdateConnectorRequest {
  clientId?: string;
  clientSecret?: string;
  enabled?: boolean;
  userId?: string;
  webhookUrl?: string;
}

export interface ConnectorTestResponse {
  checkedAt: string;
  connector: ConnectorType;
  message: string;
  status: 'success' | 'failed';
}

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
  | 'aligning'
  | 'transcribing'
  | 'extracting-frames'
  | 'uploading-frames'
  | 'analyzing-frames'
  | 'awaiting-frame-review'
  | 'summarizing'
  | 'publishing'
  | 'completed'
  | 'cancelled'
  | 'failed';

export interface UploadedMediaInput {
  downloadUrl: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  parts?: UploadedMediaPart[];
  storage?: StoredSourceObject;
}

export interface UploadedMediaPart {
  downloadUrl: string;
  fileSize: number;
  storage?: StoredSourceObject;
}

export interface StoredSourceObject {
  bucketId: string;
  filePath: string;
  fileSize: number;
  id: string;
}

export type PairedMediaAlignmentMode = 'auto' | 'manual';

export interface PairedMediaAlignmentInput {
  audioOffsetMs?: number;
  mode: PairedMediaAlignmentMode;
}

export interface PairedMediaInput {
  alignment: PairedMediaAlignmentInput;
  auxiliaryAudio: UploadedMediaInput;
  video: UploadedMediaInput;
}

export type PairedMediaAlignmentStatus = 'aligned' | 'manual' | 'needs_review';

export interface PairedMediaAlignmentResult {
  audioOffsetMs: number;
  score: number | null;
  status: PairedMediaAlignmentStatus;
}

export type FrameDensity = 'compact' | 'standard' | 'detailed';

export type FrameOutputMode =
  | 'original'
  | 'original_with_ai_notes'
  | 'original_with_ai_derivative';

export type NoteVisualOptions =
  | { mode: 'disabled' }
  | {
      allowExternalAi: boolean;
      density: FrameDensity;
      mode: 'automatic' | 'review';
      outputMode: FrameOutputMode;
    };

export type VisualPipelineStatus =
  | 'disabled'
  | 'processing'
  | 'awaiting_review'
  | 'completed'
  | 'partial'
  | 'failed';

export interface VisualPipelineWarning {
  code:
    | 'FRAME_EXTRACTION_FAILED'
    | 'FRAME_UPLOAD_PARTIAL'
    | 'FRAME_AI_PARTIAL'
    | 'FRAME_DERIVATIVE_PARTIAL'
    | 'NO_USEFUL_FRAMES';
  message: string;
}

export interface VisualPipelineSummary {
  analyzedCount: number;
  candidateCount: number;
  derivativeCount: number;
  extractedCount: number;
  presentationMode?: boolean;
  publishedCount?: number;
  selectedCount: number;
  slideCount?: number;
  status: VisualPipelineStatus;
  uploadedCount: number;
  warnings: VisualPipelineWarning[];
}

export type FrameSelectionStatus = 'candidate' | 'selected' | 'rejected';
export type FrameDerivativeStatus =
  | 'not_requested'
  | 'processing'
  | 'completed'
  | 'failed';

export interface NoteJobFrame {
  analysis?: {
    chartDesc: string;
    hasChart: boolean;
    hasText: boolean;
    isPresentationSlide?: boolean;
    score: number;
    slideTitle?: string;
    summary: string;
    text: string;
  };
  derivativeStatus: FrameDerivativeStatus;
  derivativeUrl?: string;
  displayOrder: number | null;
  extractionType: 'scene' | 'interval';
  globalTimestampMs: number;
  id: string;
  originalUrl: string;
  score: number;
  selectionStatus: FrameSelectionStatus;
  sourceFileName: string;
  sourceIndex: number;
  timestampMs: number;
}

export interface NoteJobFrameListResponse {
  items: NoteJobFrame[];
  page: number;
  pageSize: number;
  revision: number;
  totalItems: number;
}

export interface UpdateFrameSelectionRequest {
  orderedFrameIds: string[];
  revision: number;
  selectedFrameIds: string[];
}

export interface UpdateFrameSelectionResponse {
  revision: number;
  selectedFrameIds: string[];
}

export interface GenerateFrameDerivativeRequest {
  instruction?: string;
}

export interface PublishFrameSelectionRequest {
  selectionRevision: number;
}

export interface CreateNoteJobRequest {
  sourceType?: NoteSourceType;
  noteStyle?: NoteStyle;
  url?: string;
  sourcePlatform?: SourcePlatform;
  cookieBrowser?: 'chrome' | 'safari' | 'edge' | 'firefox';
  media?: UploadedMediaInput;
  mediaItems?: UploadedMediaInput[];
  pairedMedia?: PairedMediaInput;
  visualOptions?: NoteVisualOptions;
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

export type InboxMessageStatus =
  | 'QUEUED'
  | 'PROCESSING'
  | 'SUCCEEDED'
  | 'FAILED'
  | 'DUPLICATE'
  | 'IGNORED';
export interface NoteInboxSummary {
  totalMessages: number;
  succeeded: number;
  processing: number;
  queued: number;
  failed: number;
  duplicates: number;
  ignored: number;
}
export interface NoteInboxMessage {
  id: string;
  messageId: string;
  subject: string;
  originalUrl: string | null;
  platform: SourcePlatform | null;
  status: InboxMessageStatus;
  statusReason: string | null;
  messageCreatedAt: string | null;
  duplicateOfMessageId: string | null;
  jobId: string | null;
  mediaTitle: string | null;
}
export interface NoteInboxMessageListResponse {
  items: NoteInboxMessage[];
  summary: NoteInboxSummary;
}

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
  pairedAlignment?: PairedMediaAlignmentResult;
  transcriptionProvider?: 'tencent_asr' | 'local_whisper' | 'mixed';
  summaryGeneration?: SummaryGenerationInfo;
  visualOptions?: NoteVisualOptions;
  visualSummary?: VisualPipelineSummary;
  videoTitle?: string;
  rawDocumentUrl?: string;
  documentUrl?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export type SummaryGenerationStage =
  | 'preparing'
  | 'generating'
  | 'extracting'
  | 'structuring'
  | 'reviewing'
  | 'repairing'
  | 'completed'
  | 'fallback';

export interface SummaryGenerationInfo {
  attempt?: number;
  modelName: string;
  provider: 'external_model' | 'builtin';
  qualityScore?: number;
  qualityWarnings?: string[];
  stage: SummaryGenerationStage;
}

export interface SystemReadiness {
  ytDlp: boolean;
  ffmpeg: boolean;
  whisperCli: boolean;
  whisperModel: boolean;
  larkCli: boolean;
  tencentAsr: boolean;
  tencentAsrEnabled: boolean;
  ready: boolean;
  platformReady: boolean;
  mediaReady: boolean;
  documentReady: boolean;
  /** @deprecated 旧客户端兼容字段，请使用 documentReady。 */
  pdfReady: boolean;
  connectorType?: ConnectorType;
  connectorReady?: boolean;
}

export interface TencentAsrSettings {
  asrRegion: string;
  bucket: string;
  configured: boolean;
  enabled: boolean;
  engineModelType: string;
  region: string;
  secretId: string;
  secretKeyConfigured: boolean;
  speakerDiarization: boolean;
}

export interface UpdateTencentAsrSettingsRequest {
  asrRegion?: string;
  bucket: string;
  enabled: boolean;
  engineModelType?: string;
  region: string;
  secretId: string;
  /** 留空表示保留已保存的 SecretKey。 */
  secretKey?: string;
  speakerDiarization?: boolean;
}

export interface TencentAsrConnectionStatus {
  asrConnected: boolean;
  checkedAt: string;
  cosConnected: boolean;
  message: string;
}

export interface ExternalModelSettings {
  apiKeyConfigured: boolean;
  baseUrl: string;
  configured: boolean;
  enabled: boolean;
  model: string;
}

export interface UpdateExternalModelSettingsRequest {
  /** 留空表示保留已保存的 API Key。 */
  apiKey?: string;
  baseUrl: string;
  enabled: boolean;
  model: string;
}

export interface ExternalModelConnectionStatus {
  checkedAt: string;
  message: string;
}

export type TaskNotificationEvent = 'completed' | 'failed' | 'cancelled';
export type TaskNotificationTestStatus = 'success' | 'failed';

export interface TaskNotificationWebhook {
  connectorType?: ConnectorType;
  enabled: boolean;
  id: string;
  lastTestAt?: string;
  lastTestMessage?: string;
  lastTestStatus?: TaskNotificationTestStatus;
  name: string;
  secretConfigured: boolean;
  url: string;
}

export interface TaskNotificationSettings {
  configured: boolean;
  items: TaskNotificationWebhook[];
}

export interface CreateTaskNotificationWebhookRequest {
  connectorType?: ConnectorType;
  enabled: boolean;
  name: string;
  secret?: string;
  url: string;
}

export interface UpdateTaskNotificationWebhookRequest {
  connectorType?: ConnectorType;
  enabled: boolean;
  name: string;
  /** 留空表示保留已保存的签名密钥。 */
  secret?: string;
  url: string;
}

export interface TaskNotificationConnectionStatus {
  checkedAt: string;
  message: string;
}

export type ConversionStatus = 'processing' | 'completed' | 'failed';
export type NoteProcessingStatus = 'pending' | 'processed';
export type TaskSyncStatus = 'not_created' | 'created' | 'failed';
export type NoteRerunMode = 'initial' | 'regenerate_note' | 'full_reprocess';
export type SourceAssetStatus =
  | 'retained'
  | 'partial'
  | 'deleted'
  | 'unavailable'
  | 'remote';

export interface RetainedUploadedMedia {
  fileName: string;
  fileSize: number;
  mimeType: string;
  objects: StoredSourceObject[];
  partCount: number;
}

export type RetainedNoteSource =
  | {
      cookieBrowser?: 'chrome' | 'safari' | 'edge' | 'firefox';
      noteStyle: NoteStyle;
      sourcePlatform: SourcePlatform;
      sourceType: 'platform';
      url: string;
      visualOptions: NoteVisualOptions;
    }
  | {
      mediaItems: RetainedUploadedMedia[];
      noteStyle: NoteStyle;
      sourceType: 'video' | 'audio' | 'document' | 'pdf';
      visualOptions: NoteVisualOptions;
    }
  | {
      noteStyle: NoteStyle;
      pairedMedia: {
        alignment: PairedMediaAlignmentInput;
        auxiliaryAudio: RetainedUploadedMedia;
        video: RetainedUploadedMedia;
      };
      sourceType: 'paired';
      visualOptions: NoteVisualOptions;
    };

export interface NoteSourceAssetSummary {
  deletedAt: string | null;
  fileCount: number;
  fileNames: string[];
  objectCount: number;
  status: SourceAssetStatus;
  totalBytes: number;
}

export interface NoteSourceSnapshotResponse {
  inUse: boolean;
  source: RetainedNoteSource | null;
  summary: NoteSourceAssetSummary;
}

export interface ConfirmDeletedSourceObjectsRequest {
  objectIds: string[];
}

export interface RegenerateRawDocumentResponse {
  rawDocumentUrl: string;
}

export interface NoteConversionRecord {
  id: string;
  jobId: string;
  title: string;
  sourceType: NoteSourceType;
  sourceLabel: string;
  status: ConversionStatus;
  currentStage?: JobStage;
  progress?: number;
  statusMessage?: string;
  error?: string | null;
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
  parentJobId: string | null;
  rerunMode: NoteRerunMode;
  sourceAssets: NoteSourceAssetSummary;
  visualOptions?: NoteVisualOptions;
  versionNumber: number;
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
  connectorType?: ConnectorType;
  connectorReady?: boolean;
}
