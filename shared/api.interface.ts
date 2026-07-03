export type SourcePlatform = 'bilibili' | 'douyin';

export type JobStage =
  | 'queued'
  | 'checking'
  | 'downloading'
  | 'transcribing'
  | 'summarizing'
  | 'publishing'
  | 'completed'
  | 'failed';

export interface CreateNoteJobRequest {
  url: string;
  sourcePlatform?: SourcePlatform;
  cookieBrowser?: 'chrome' | 'safari' | 'edge' | 'firefox';
}

export interface NoteJob {
  id: string;
  stage: JobStage;
  progress: number;
  message: string;
  sourcePlatform: SourcePlatform;
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
