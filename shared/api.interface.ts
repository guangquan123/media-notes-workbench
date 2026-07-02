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
  apiKey?: string;
}

export interface NoteJob {
  id: string;
  stage: JobStage;
  progress: number;
  message: string;
  videoTitle?: string;
  documentUrl?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export interface SystemReadiness {
  ytDlp: boolean;
  ffmpeg: boolean;
  larkCli: boolean;
  openAiConfigured: boolean;
  ready: boolean;
}
