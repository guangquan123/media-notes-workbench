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
  cookieBrowser?: 'chrome' | 'safari' | 'edge' | 'firefox';
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
  whisperCli: boolean;
  whisperModel: boolean;
  larkCli: boolean;
  ready: boolean;
}
