export type SourcePlatform = 'bilibili' | 'douyin';

export type NoteSourceType = 'platform' | 'video' | 'audio';

export type JobStage =
  | 'queued'
  | 'uploading'
  | 'checking'
  | 'preparing'
  | 'downloading'
  | 'transcribing'
  | 'summarizing'
  | 'publishing'
  | 'completed'
  | 'failed';

export interface UploadedMediaInput {
  downloadUrl: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}

export interface CreateNoteJobRequest {
  sourceType?: NoteSourceType;
  url?: string;
  sourcePlatform?: SourcePlatform;
  cookieBrowser?: 'chrome' | 'safari' | 'edge' | 'firefox';
  media?: UploadedMediaInput;
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
  videoTitle?: string;
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
}

export type ConversionStatus = 'processing' | 'completed' | 'failed';

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
  documentUrl: string | null;
}

export interface NoteConversionHistoryResponse {
  items: NoteConversionRecord[];
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
