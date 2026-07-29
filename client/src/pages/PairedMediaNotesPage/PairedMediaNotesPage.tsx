import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  FileAudio,
  FileVideo,
  LoaderCircle,
  RefreshCcw,
  Sparkles,
  WandSparkles,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { createNoteJob, getNoteJob, getReadiness } from '@/api';
import NoteStyleSelector from '@/components/NoteStyleSelector';
import { FrameReviewPanel } from '@/components/note-visuals/FrameReviewPanel';
import { VisualOptionsPanel } from '@/components/note-visuals/VisualOptionsPanel';
import {
  deleteUploadedFiles,
  uploadMediaFile,
  type MediaUploadProgress,
  type UploadFileData,
} from '@/components/business-ui/api/files/service';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { formatFileSize } from '@/utils/file-size';
import type {
  NoteJob,
  NoteStyle,
  NoteVisualOptions,
  PairedMediaAlignmentMode,
  SystemReadiness,
} from '@shared/api.interface';
import { PairedMediaUploadSlot } from './PairedMediaUploadSlot';
import {
  AUDIO_ACCEPT,
  getPairedLogicalStage,
  MAX_PAIRED_MEDIA_SIZE,
  PAIRED_PROCESS_STAGES,
  toUploadedMediaInput,
  VIDEO_ACCEPT,
} from './paired-media-page.utils';

const READINESS_RETRY_DELAY_MS = 1_200;

export default function PairedMediaNotesPage() {
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [noteStyle, setNoteStyle] = useState<NoteStyle>('meeting');
  const [visualOptions, setVisualOptions] = useState<NoteVisualOptions>({
    mode: 'disabled',
  });
  const [alignmentMode, setAlignmentMode] =
    useState<PairedMediaAlignmentMode>('auto');
  const [manualOffsetSeconds, setManualOffsetSeconds] = useState('0');
  const [job, setJob] = useState<NoteJob | null>(null);
  const [readiness, setReadiness] = useState<SystemReadiness | null>(null);
  const [uploadedMedia, setUploadedMedia] = useState<UploadFileData[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadedBytes, setUploadedBytes] = useState(0);
  const [uploadLabel, setUploadLabel] = useState('');
  const selectedBytes: number =
    (videoFile?.size || 0) + (audioFile?.size || 0);
  const running: boolean = Boolean(
    job &&
      !['completed', 'failed', 'awaiting-frame-review'].includes(job.stage),
  );

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      for (let attempt = 1; attempt <= 3; attempt += 1) {
        try {
          const result: SystemReadiness = await getReadiness();
          if (!cancelled) setReadiness(result);
          return;
        } catch {
          if (attempt === 3 && !cancelled) {
            toast.error('暂时无法检查处理环境');
            return;
          }
          await new Promise<void>((resolve: () => void) => {
            window.setTimeout(resolve, attempt * READINESS_RETRY_DELAY_MS);
          });
        }
      }
    };
    void load();
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
        if (next.stage === 'completed') toast.success('双源笔记已经创建');
        if (next.stage === 'failed') toast.error(next.error || '处理失败');
        if (
          ['completed', 'failed', 'awaiting-frame-review'].includes(next.stage)
        ) {
          try {
            await deleteUploadedFiles(uploadedMedia);
            setUploadedMedia([]);
          } catch {
            toast.warning('源文件自动清理失败，可稍后在应用文件中删除');
          }
        }
      } catch {
        // Temporary polling failures do not interrupt the server-side task.
      } finally {
        if (!cancelled) timer = window.setTimeout(poll, 1_800);
      }
    };
    timer = window.setTimeout(poll, 1_800);
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [job?.id, running, uploadedMedia]);

  const start = async () => {
    if (!videoFile || !audioFile) {
      toast.error('请同时选择主视频和辅助录音');
      return;
    }
    if (selectedBytes > MAX_PAIRED_MEDIA_SIZE) {
      toast.error('视频和辅助录音累计不能超过 10 GB');
      return;
    }
    const offsetSeconds: number = Number(manualOffsetSeconds);
    if (
      alignmentMode === 'manual' &&
      (!Number.isFinite(offsetSeconds) || Math.abs(offsetSeconds) > 14_400)
    ) {
      toast.error('手动偏移必须在正负 4 小时内');
      return;
    }
    setSubmitting(true);
    setUploading(true);
    setUploadedBytes(0);
    let completedBytes = 0;
    let uploads: UploadFileData[] = [];
    try {
      const videoUploads: UploadFileData[] = await uploadMediaFile(
        videoFile,
        (progress: MediaUploadProgress) => {
          setUploadedBytes(progress.uploadedBytes);
          setUploadLabel(
            `正在上传主视频 · 分片 ${progress.currentPart}/${progress.totalParts}`,
          );
        },
      );
      uploads = [...videoUploads];
      completedBytes = videoFile.size;
      const audioUploads: UploadFileData[] = await uploadMediaFile(
        audioFile,
        (progress: MediaUploadProgress) => {
          setUploadedBytes(completedBytes + progress.uploadedBytes);
          setUploadLabel(
            `正在上传辅助录音 · 分片 ${progress.currentPart}/${progress.totalParts}`,
          );
        },
      );
      uploads = [...uploads, ...audioUploads];
      setUploadedMedia(uploads);
      setUploadedBytes(selectedBytes);
      setUploading(false);
      const created: NoteJob = await createNoteJob({
        sourceType: 'paired',
        noteStyle,
        pairedMedia: {
          video: toUploadedMediaInput(videoFile, videoUploads, 'video'),
          auxiliaryAudio: toUploadedMediaInput(
            audioFile,
            audioUploads,
            'audio',
          ),
          alignment: {
            mode: alignmentMode,
            audioOffsetMs:
              alignmentMode === 'manual'
                ? Math.round(offsetSeconds * 1_000)
                : undefined,
          },
        },
        visualOptions,
      });
      setJob(created);
    } catch (error: unknown) {
      if (uploads.length > 0) {
        try {
          await deleteUploadedFiles(uploads);
          setUploadedMedia([]);
        } catch {
          toast.warning('上传文件清理失败，可稍后在应用文件中删除');
        }
      }
      const responseError = error as {
        response?: {
          data?: { error?: { message?: string }; message?: string };
        };
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
    setVideoFile(null);
    setAudioFile(null);
    setJob(null);
    setNoteStyle('meeting');
    setAlignmentMode('auto');
    setManualOffsetSeconds('0');
    setVisualOptions({ mode: 'disabled' });
    setUploadedBytes(0);
    setUploadLabel('');
  };

  const logicalStage: string | undefined = uploading
    ? 'uploading'
    : getPairedLogicalStage(job?.stage);
  const currentStageIndex: number = PAIRED_PROCESS_STAGES.findIndex(
    (stage: readonly [string, string]): boolean => stage[0] === logicalStage,
  );
  const displayProgress: number = uploading
    ? Math.round((uploadedBytes / Math.max(1, selectedBytes)) * 100)
    : job?.progress || 0;

  return (
    <main className="min-h-screen overflow-auto bg-[#f6f7f5] text-[#111315]">
      <div className="mx-auto min-h-screen max-w-7xl px-5 py-7 md:px-10 md:py-10">
        <header className="flex flex-col gap-4 border-b border-black/8 pb-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-2xl bg-[#4d5dff] text-white">
              <Sparkles className="size-5" />
            </div>
            <div>
              <p className="text-sm font-semibold">双源会议 / 培训工作台</p>
              <p className="text-xs text-black/45">
                视频看画面，录音补语义，两路互相校验
              </p>
            </div>
          </div>
          <Link
            className="inline-flex w-fit items-center gap-2 rounded-full border border-black/8 bg-white px-4 py-2 text-sm text-black/62"
            to="/"
          >
            <ArrowLeft className="size-4" />
            返回入口
          </Link>
        </header>

        <section className="grid gap-8 py-9 lg:grid-cols-[.9fr_1.1fr]">
          <div>
            <p className="text-sm font-semibold text-[#4d5dff]">
              双录制文件交叉验证
            </p>
            <h1 className="mt-4 text-balance text-4xl font-semibold leading-tight tracking-[-0.04em] md:text-5xl">
              把同一场内容的画面和声音，合成一份可核对的笔记。
            </h1>
            <p className="mt-5 max-w-xl text-base leading-7 text-black/52">
              系统会自动对齐两路声音，分别转写，再结合视频关键画面生成融合时间线。
              数字、术语或结论不一致时会保留两种说法，交给你确认。
            </p>
            <div className="mt-8 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
              {PAIRED_PROCESS_STAGES.map(
                (stage: readonly [string, string], index: number) => (
                  <div
                    className={`rounded-xl border bg-white px-3 py-3 text-center text-xs ${
                      currentStageIndex === index
                        ? 'border-[#4d5dff] text-[#3848d7]'
                        : 'border-black/7 text-black/45'
                    }`}
                    key={stage[0]}
                  >
                    {job?.stage === 'completed' || index < currentStageIndex ? (
                      <Check className="mx-auto mb-1 size-4 text-emerald-600" />
                    ) : (
                      <span className="mb-1 block font-semibold">
                        {index + 1}
                      </span>
                    )}
                    {stage[1]}
                  </div>
                ),
              )}
            </div>
          </div>

          <div className="rounded-[2rem] border border-black/8 bg-white p-6 shadow-[0_28px_80px_rgba(35,30,24,0.1)] md:p-8">
            {!job && !uploading ? (
              <>
                <div className="grid gap-4 md:grid-cols-2">
                  <PairedMediaUploadSlot
                    accept={VIDEO_ACCEPT}
                    disabled={submitting}
                    file={videoFile}
                    hint="提供屏幕、PPT 和视频音轨"
                    icon={FileVideo}
                    label="主视频"
                    onChange={setVideoFile}
                  />
                  <PairedMediaUploadSlot
                    accept={AUDIO_ACCEPT}
                    disabled={submitting}
                    file={audioFile}
                    hint="提供更清晰的讲话内容"
                    icon={FileAudio}
                    label="辅助录音"
                    onChange={setAudioFile}
                  />
                </div>
                <p className="mt-3 text-xs text-black/42">
                  两个文件累计 {formatFileSize(selectedBytes)} / 10 GB
                </p>

                <div className="mt-6 rounded-2xl bg-[#f7f7f5] p-4">
                  <p className="text-sm font-semibold">时间对齐</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      onClick={() => setAlignmentMode('auto')}
                      size="sm"
                      type="button"
                      variant={alignmentMode === 'auto' ? 'default' : 'outline'}
                    >
                      自动对齐
                    </Button>
                    <Button
                      onClick={() => setAlignmentMode('manual')}
                      size="sm"
                      type="button"
                      variant={
                        alignmentMode === 'manual' ? 'default' : 'outline'
                      }
                    >
                      手动偏移
                    </Button>
                  </div>
                  {alignmentMode === 'manual' && (
                    <div className="mt-4">
                      <label
                        className="text-xs font-medium text-black/60"
                        htmlFor="manual-offset"
                      >
                        辅助录音相对视频的偏移秒数
                      </label>
                      <Input
                        className="mt-2"
                        id="manual-offset"
                        onChange={(event) =>
                          setManualOffsetSeconds(event.target.value)
                        }
                        step="0.1"
                        type="number"
                        value={manualOffsetSeconds}
                      />
                      <p className="mt-2 text-xs text-black/42">
                        正数表示录音晚于视频开始，负数表示录音更早开始。
                      </p>
                    </div>
                  )}
                </div>

                <div className="mt-5">
                  <NoteStyleSelector
                    disabled={submitting}
                    onChange={setNoteStyle}
                    value={noteStyle}
                  />
                </div>
                <VisualOptionsPanel
                  disabled={submitting}
                  onChange={setVisualOptions}
                  value={visualOptions}
                />
                <Button
                  className="mt-6 h-12 w-full rounded-xl bg-[#4d5dff] text-white hover:bg-[#3f4edb]"
                  disabled={
                    !videoFile ||
                    !audioFile ||
                    selectedBytes > MAX_PAIRED_MEDIA_SIZE ||
                    submitting ||
                    !readiness?.mediaReady
                  }
                  onClick={start}
                >
                  <WandSparkles className="size-4" />
                  开始双源交叉验证
                </Button>
                {readiness && !readiness.mediaReady && (
                  <p className="mt-3 text-center text-xs text-amber-700">
                    本机 ffmpeg 或 Whisper 环境尚未就绪
                  </p>
                )}
              </>
            ) : (
              <div className="flex min-h-[500px] flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-lg font-semibold">
                        {job?.stage === 'completed'
                          ? '双源笔记已经准备好'
                          : '正在处理双源文件'}
                      </p>
                      <p className="mt-1 truncate text-sm text-black/45">
                        {job?.mediaFileName ||
                          [videoFile?.name, audioFile?.name]
                            .filter(Boolean)
                            .join('、')}
                      </p>
                    </div>
                    {(uploading || running) && (
                      <LoaderCircle className="size-5 animate-spin text-[#4d5dff]" />
                    )}
                  </div>
                  <div className="mt-9">
                    <div className="mb-3 flex justify-between gap-4 text-sm">
                      <span>{uploading ? uploadLabel : job?.message}</span>
                      <span className="tabular-nums text-black/38">
                        {displayProgress}%
                      </span>
                    </div>
                    <Progress value={displayProgress} />
                  </div>
                  {job?.pairedAlignment && (
                    <div className="mt-6 rounded-xl border border-[#4d5dff]/15 bg-[#f4f5ff] p-4 text-sm">
                      <p className="font-semibold">时间对齐结果</p>
                      <p className="mt-1 text-black/55">
                        辅助录音相对视频偏移{' '}
                        {(job.pairedAlignment.audioOffsetMs / 1_000).toFixed(1)}{' '}
                        秒
                        {job.pairedAlignment.score !== null
                          ? `，相关度 ${job.pairedAlignment.score.toFixed(3)}`
                          : '，使用手动设置'}
                      </p>
                    </div>
                  )}
                  {job?.stage === 'failed' && (
                    <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-700">
                      {job.error}
                    </div>
                  )}
                  {job?.visualSummary?.warnings.map((warning) => (
                    <div
                      className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800"
                      key={warning.code}
                    >
                      {warning.message}
                    </div>
                  ))}
                  {job?.stage === 'completed' && (
                    <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
                      双路转写、关键画面和冲突清单已经写入飞书文档。
                    </div>
                  )}
                </div>
                <div className="mt-8 space-y-3">
                  {job?.documentUrl && (
                    <Button
                      className="h-12 w-full rounded-xl bg-[#3370ff] text-white hover:bg-[#2864ea]"
                      onClick={() =>
                        window.open(
                          job.documentUrl,
                          '_blank',
                          'noopener,noreferrer',
                        )
                      }
                    >
                      打开飞书笔记
                      <ArrowUpRight className="size-4" />
                    </Button>
                  )}
                  {job && ['completed', 'failed'].includes(job.stage) && (
                    <Button
                      className="h-11 w-full rounded-xl"
                      onClick={reset}
                      variant="outline"
                    >
                      <RefreshCcw className="size-4" />
                      处理下一组文件
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        </section>
        {job?.stage === 'awaiting-frame-review' && (
          <FrameReviewPanel job={job} onPublished={setJob} />
        )}
      </div>
    </main>
  );
}
