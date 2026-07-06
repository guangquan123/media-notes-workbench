import { useEffect, useState, type CSSProperties } from 'react';
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  FileAudio,
  FileVideo,
  LoaderCircle,
  Sparkles,
  UploadCloud,
  WandSparkles,
  X,
} from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { createNoteJob, getNoteJob, getReadiness } from '@/api';
import NoteStyleSelector from '@/components/NoteStyleSelector';
import {
  deleteUploadedFile,
  uploadFile,
  type UploadFileData,
} from '@/components/business-ui/api/files/service';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import type {
  NoteJob,
  NoteStyle,
  NoteSourceType,
  SystemReadiness,
} from '@shared/api.interface';

interface MediaNotePageProps {
  sourceType: Exclude<NoteSourceType, 'platform'>;
}

interface PageCopy {
  accent: string;
  accentSoft: string;
  accept: Record<string, string[]>;
  description: string;
  eyebrow: string;
  fileHint: string;
  title: string;
}

const MAX_FILE_SIZE = 1024 * 1024 * 1024;

const PAGE_COPY: Record<MediaNotePageProps['sourceType'], PageCopy> = {
  video: {
    accent: '#e86f3d',
    accentSoft: '#fff2eb',
    accept: {
      'video/mp4': ['.mp4'],
      'video/quicktime': ['.mov'],
      'video/x-matroska': ['.mkv'],
      'video/webm': ['.webm'],
    },
    description:
      '上传课程、讲座或屏幕录制，系统会提取音轨、转录内容并整理成飞书学习笔记。',
    eyebrow: '本地视频工作台',
    fileHint: '支持 MP4、MOV、MKV、WebM，最大 1 GB',
    title: '把本地视频，变成一篇有结构的学习笔记。',
  },
  audio: {
    accent: '#168b75',
    accentSoft: '#eaf8f4',
    accept: {
      'audio/mpeg': ['.mp3'],
      'audio/mp4': ['.m4a'],
      'audio/wav': ['.wav'],
      'audio/x-wav': ['.wav'],
      'audio/aac': ['.aac'],
      'audio/flac': ['.flac'],
      'audio/ogg': ['.ogg'],
    },
    description:
      '上传课堂录音、访谈或语音备忘，系统会转成文字、提炼重点并写入飞书。',
    eyebrow: '录音整理工作台',
    fileHint: '支持 MP3、M4A、WAV、AAC、FLAC、OGG，最大 1 GB',
    title: '让一段录音，沉淀成真正可复习的笔记。',
  },
};

const PROCESS_STAGES = [
  ['uploading', '安全上传'],
  ['preparing', '整理媒体'],
  ['transcribing', '语音转文字'],
  ['summarizing', '生成笔记'],
  ['publishing', '写入飞书'],
] as const;

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function getMediaMimeType(file: File, sourceType: 'video' | 'audio'): string {
  if (file.type) return file.type;
  const extension: string = file.name.split('.').pop()?.toLowerCase() || '';
  const mimeTypes: Record<string, string> = {
    aac: 'audio/aac',
    flac: 'audio/flac',
    m4a: 'audio/mp4',
    mkv: 'video/x-matroska',
    mov: 'video/quicktime',
    mp3: 'audio/mpeg',
    mp4: 'video/mp4',
    ogg: 'audio/ogg',
    wav: 'audio/wav',
    webm: 'video/webm',
  };
  return mimeTypes[extension] || `${sourceType}/unknown`;
}

export default function MediaNotePage({ sourceType }: MediaNotePageProps) {
  const copy: PageCopy = PAGE_COPY[sourceType];
  const MediaIcon = sourceType === 'video' ? FileVideo : FileAudio;
  const [file, setFile] = useState<File | null>(null);
  const [noteStyle, setNoteStyle] = useState<NoteStyle>('systematic');
  const [job, setJob] = useState<NoteJob | null>(null);
  const [readiness, setReadiness] = useState<SystemReadiness | null>(null);
  const [uploadedMedia, setUploadedMedia] = useState<UploadFileData | null>(
    null,
  );
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const running: boolean = Boolean(
    job && !['completed', 'failed'].includes(job.stage),
  );
  const dropzone = useDropzone({
    accept: copy.accept,
    maxFiles: 1,
    maxSize: MAX_FILE_SIZE,
    disabled: submitting,
    onDropAccepted: (files: File[]) => setFile(files[0] || null),
    onDropRejected: () =>
      toast.error(
        `文件格式不支持或超过 1 GB，请重新选择${sourceType === 'video' ? '视频' : '录音'}`,
      ),
  });

  useEffect(() => {
    let cancelled = false;
    const loadReadiness = async () => {
      try {
        const next: SystemReadiness = await getReadiness();
        if (!cancelled) setReadiness(next);
      } catch {
        if (!cancelled) toast.error('暂时无法检查处理环境');
      }
    };
    void loadReadiness();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!job || !running) return;
    let cancelled = false;
    let timer: number | undefined;
    const poll = async () => {
      try {
        const next: NoteJob = await getNoteJob(job.id);
        if (cancelled) return;
        setJob(next);
        if (next.stage === 'completed') toast.success('飞书学习笔记已经创建');
        if (next.stage === 'failed') toast.error(next.error || '处理失败');
        if (
          uploadedMedia &&
          ['completed', 'failed'].includes(next.stage)
        ) {
          try {
            await deleteUploadedFile(uploadedMedia);
            setUploadedMedia(null);
          } catch {
            toast.warning('源文件自动清理失败，可稍后在应用文件中删除');
          }
        }
      } catch {
        // A temporary polling error should not interrupt the server-side task.
      } finally {
        if (!cancelled) timer = window.setTimeout(poll, 1800);
      }
    };
    timer = window.setTimeout(poll, 1800);
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [job?.id, running, uploadedMedia]);

  const start = async () => {
    if (!file) {
      toast.error(`请先选择${sourceType === 'video' ? '视频' : '录音'}文件`);
      return;
    }
    setSubmitting(true);
    setUploading(true);
    let uploaded: UploadFileData | null = null;
    try {
      uploaded = await uploadFile(file);
      setUploadedMedia(uploaded);
      setUploading(false);
      const created: NoteJob = await createNoteJob({
        sourceType,
        noteStyle,
        media: {
          downloadUrl: uploaded.url,
          fileName: file.name,
          fileSize: file.size,
          mimeType: getMediaMimeType(file, sourceType),
        },
      });
      setJob(created);
    } catch (error: unknown) {
      if (uploaded) {
        try {
          await deleteUploadedFile(uploaded);
          setUploadedMedia(null);
        } catch {
          toast.warning('上传文件清理失败，可稍后在应用文件中删除');
        }
      }
      const responseError = error as {
        response?: { data?: { error?: { message?: string }; message?: string } };
      };
      toast.error(
        responseError.response?.data?.error?.message ||
          responseError.response?.data?.message ||
          '任务创建失败，请稍后重试',
      );
    } finally {
      setUploading(false);
      setSubmitting(false);
    }
  };

  const reset = () => {
    setJob(null);
    setFile(null);
    setNoteStyle('systematic');
  };

  const displayProgress: number = uploading ? 8 : job?.progress || 0;
  const displayMessage: string = uploading
    ? '正在安全上传文件…'
    : job?.message || '等待开始';

  return (
    <main
      className="min-h-screen overflow-auto bg-[#f7f7f5] text-[#161616]"
      style={{ '--media-accent': copy.accent } as CSSProperties}
    >
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-5 py-7 md:px-10 md:py-10">
        <header className="flex flex-col gap-4 border-b border-black/8 pb-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div
              className="grid size-10 place-items-center rounded-2xl text-white shadow-sm"
              style={{ backgroundColor: copy.accent }}
            >
              <MediaIcon className="size-5" />
            </div>
            <div>
              <p className="text-sm font-semibold">{copy.eyebrow}</p>
              <p className="text-xs text-black/45">上传、转录、总结、发布</p>
            </div>
          </div>
          <Link
            className="inline-flex w-fit items-center gap-2 rounded-full border border-black/8 bg-white px-4 py-2 text-sm text-black/62 shadow-sm transition hover:border-black/15 hover:text-black"
            to="/"
          >
            <ArrowLeft className="size-4" />
            返回入口
          </Link>
        </header>

        <section className="grid flex-1 items-center gap-12 py-12 lg:grid-cols-[1.05fr_.95fr]">
          <div className="max-w-xl">
            <div
              className="mb-5 inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium"
              style={{
                backgroundColor: copy.accentSoft,
                borderColor: `${copy.accent}22`,
                color: copy.accent,
              }}
            >
              <Sparkles className="size-3.5" />
              {copy.eyebrow}
            </div>
            <h1 className="text-balance text-4xl font-semibold leading-[1.1] tracking-[-0.04em] md:text-6xl">
              {copy.title}
            </h1>
            <p className="mt-6 max-w-lg text-base leading-7 text-black/52 md:text-lg">
              {copy.description}
            </p>
            <div className="mt-9 grid grid-cols-2 gap-3 sm:grid-cols-5">
              {PROCESS_STAGES.map(([stage, label], index) => {
                const currentStage = uploading ? 'uploading' : job?.stage;
                const currentIndex = PROCESS_STAGES.findIndex(
                  ([item]) => item === currentStage,
                );
                const done =
                  job?.stage === 'completed' ||
                  (currentIndex >= 0 && index < currentIndex);
                const active = currentStage === stage;
                return (
                  <div
                    className={`rounded-2xl border bg-white px-3 py-4 text-center text-xs transition ${
                      active
                        ? 'border-[var(--media-accent)] shadow-sm'
                        : 'border-black/7 text-black/48'
                    }`}
                    key={stage}
                  >
                    <div
                      className={`mx-auto mb-2 grid size-7 place-items-center rounded-full ${
                        done || active ? 'text-white' : 'bg-black/5 text-black/35'
                      }`}
                      style={
                        done || active
                          ? { backgroundColor: copy.accent }
                          : undefined
                      }
                    >
                      {done ? (
                        <Check className="size-3.5" />
                      ) : (
                        <span>{index + 1}</span>
                      )}
                    </div>
                    {label}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-[2rem] border border-black/8 bg-white p-6 shadow-[0_28px_80px_rgba(35,30,24,0.1)] md:p-8">
            {!job && !uploading ? (
              <>
                <p className="text-lg font-semibold tracking-tight">
                  选择{sourceType === 'video' ? '视频' : '录音'}文件
                </p>
                <p className="mt-1 text-sm text-black/45">{copy.fileHint}</p>
                <div
                  {...dropzone.getRootProps()}
                  className={`mt-7 cursor-pointer rounded-3xl border border-dashed px-6 py-10 text-center transition ${
                    dropzone.isDragActive
                      ? 'border-[var(--media-accent)] bg-black/[0.025]'
                      : 'border-black/15 bg-[#fafaf8] hover:border-black/25'
                  }`}
                >
                  <input {...dropzone.getInputProps()} />
                  <div
                    className="mx-auto grid size-12 place-items-center rounded-2xl text-white"
                    style={{ backgroundColor: copy.accent }}
                  >
                    <UploadCloud className="size-5" />
                  </div>
                  <p className="mt-4 text-sm font-semibold">
                    拖入文件，或点击选择
                  </p>
                  <p className="mt-2 text-xs leading-5 text-black/38">
                    文件仅用于生成当前学习笔记
                  </p>
                </div>

                {file && (
                  <div className="mt-4 flex items-center gap-3 rounded-2xl border border-black/7 bg-white p-3 shadow-sm">
                    <div
                      className="grid size-10 shrink-0 place-items-center rounded-xl"
                      style={{
                        backgroundColor: copy.accentSoft,
                        color: copy.accent,
                      }}
                    >
                      <MediaIcon className="size-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{file.name}</p>
                      <p className="mt-0.5 text-xs text-black/38">
                        {formatFileSize(file.size)}
                      </p>
                    </div>
                    <button
                      aria-label="移除文件"
                      className="grid size-8 place-items-center rounded-lg text-black/38 transition hover:bg-black/5 hover:text-black"
                      onClick={(event) => {
                        event.stopPropagation();
                        setFile(null);
                      }}
                      type="button"
                    >
                      <X className="size-4" />
                    </button>
                  </div>
                )}

                <div className="mt-5">
                  <NoteStyleSelector
                    disabled={submitting}
                    onChange={setNoteStyle}
                    value={noteStyle}
                  />
                </div>

                <Button
                  className="mt-6 h-12 w-full rounded-xl text-white shadow-lg"
                  disabled={!file || submitting || !readiness?.mediaReady}
                  onClick={start}
                  style={{ backgroundColor: copy.accent }}
                >
                  <WandSparkles className="mr-2 size-4" />
                  开始生成学习笔记
                </Button>
                {readiness && !readiness.mediaReady && (
                  <p className="mt-3 text-center text-xs text-amber-700">
                    本机音频处理环境尚未就绪
                  </p>
                )}
              </>
            ) : (
              <div className="flex min-h-[390px] flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-lg font-semibold tracking-tight">
                        {job?.stage === 'completed'
                          ? '笔记已经准备好'
                          : `正在处理${sourceType === 'video' ? '视频' : '录音'}`}
                      </p>
                      <p className="mt-1 truncate text-sm text-black/45">
                        {job?.mediaFileName || file?.name}
                      </p>
                    </div>
                    {(uploading || running) && (
                      <LoaderCircle
                        className="mt-1 size-5 shrink-0 animate-spin"
                        style={{ color: copy.accent }}
                      />
                    )}
                  </div>
                  <div className="mt-10">
                    <div className="mb-3 flex items-center justify-between gap-4 text-sm">
                      <span className="font-medium">{displayMessage}</span>
                      <span className="tabular-nums text-black/38">
                        {displayProgress}%
                      </span>
                    </div>
                    <Progress
                      className="h-2 bg-black/6 [&>div]:bg-[var(--media-accent)]"
                      value={displayProgress}
                    />
                  </div>
                  {job?.stage === 'failed' && (
                    <div className="mt-7 rounded-xl border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-700">
                      {job.error}
                    </div>
                  )}
                  {job?.stage === 'completed' && (
                    <div className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
                      <div className="flex items-center gap-3">
                        <div className="grid size-9 place-items-center rounded-full bg-emerald-600 text-white">
                          <Check className="size-5" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-emerald-950">
                            飞书文档创建成功
                          </p>
                          <p className="mt-0.5 text-xs text-emerald-800/60">
                            现在可以打开检查学习笔记
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                <div className="mt-9 space-y-3">
                  {job?.documentUrl && (
                    <Button
                      className="h-12 w-full rounded-xl bg-[#3370ff] hover:bg-[#2864ea]"
                      onClick={() =>
                        window.open(
                          job.documentUrl,
                          '_blank',
                          'noopener,noreferrer',
                        )
                      }
                    >
                      打开总结笔记
                      <ArrowUpRight className="ml-2 size-4" />
                    </Button>
                  )}
                  {job?.rawDocumentUrl && (
                    <Button
                      className="h-11 w-full rounded-xl border-black/10 bg-white text-black hover:bg-black/5"
                      onClick={() =>
                        window.open(
                          job.rawDocumentUrl,
                          '_blank',
                          'noopener,noreferrer',
                        )
                      }
                      variant="outline"
                    >
                      查看原始转录
                      <ArrowUpRight className="ml-2 size-4" />
                    </Button>
                  )}
                  {job && ['completed', 'failed'].includes(job.stage) && (
                    <Button
                      className="h-11 w-full rounded-xl"
                      onClick={reset}
                      variant="outline"
                    >
                      再处理一个文件
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>
        <footer className="flex flex-col gap-2 border-t border-black/6 py-5 text-xs text-black/35 sm:flex-row sm:items-center sm:justify-between">
          <span>上传文件仅用于生成个人学习笔记</span>
          <span>异步处理 · 实时进度 · 临时文件自动清理</span>
        </footer>
      </div>
    </main>
  );
}
