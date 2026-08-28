import { useEffect, useRef, useState, type MouseEvent } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowUpRight,
  Mic2,
  XCircle,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import {
  cancelNoteJob,
  createNoteJob,
  getNoteJob,
  getReadiness,
} from '@/api';
import {
  deleteUploadedFiles,
  toStoredSourceObject,
  uploadMediaFile,
  type MediaUploadProgress,
  type UploadFileData,
} from '@/components/business-ui/api/files/service';
import type {
  NoteJob,
  NoteStyle,
  SystemReadiness,
  TranscriptionLanguageMode,
  UploadedMediaInput,
} from '@shared/api.interface';
import {
  buildRecordingFileName,
  DEFAULT_RECORDING_AUDIO_PROFILE,
  getDefaultRecordingTitle,
  getMicrophoneErrorMessage,
  MIN_RECORDING_DURATION_MS,
  SILENCE_WARNING_MS,
  type RecordingAudioProfile,
  type RecordingIntegrityCheck,
  validateRecordingFile,
} from './recording-note.utils';
import {
  checkRecordingStorage,
  deleteStoredRecording,
  loadLatestStoredRecording,
  type RecoverableRecording,
} from './recording-storage';
import {
  ReliableRecorder,
  type RecorderDeviceState,
  type RecorderMetrics,
  type RecorderPreparation,
  type RecordingResult,
} from './reliable-recorder';
import {
  ProcessingPanel,
  RecordingPanel,
  ReviewPanel,
  SetupPanel,
  StatusLine,
} from './RecordingPanels';
import { getTranscriptionProviderLabel } from './recording-processing.utils';

type RecordingPhase = 'setup' | 'recording' | 'paused' | 'review' | 'processing';
type QualityLevel = 'good' | 'warning' | 'poor';

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return '操作失败，请稍后重试';
}

function getQualityCopy(level: QualityLevel): {
  description: string;
  label: string;
} {
  if (level === 'good') {
    return { description: '声音输入稳定，可以继续录音', label: '声音清晰' };
  }
  if (level === 'warning') {
    return { description: '建议靠近麦克风并避免敲击桌面', label: '需要留意' };
  }
  return { description: '暂未确认有效声音，请先说话测试', label: '未检测到声音' };
}

export default function RecordingNotesPage() {
  const [phase, setPhase] = useState<RecordingPhase>('setup');
  const [title, setTitle] = useState<string>(getDefaultRecordingTitle());
  const [noteStyle, setNoteStyle] = useState<NoteStyle>('meeting');
  const [audioProfile, setAudioProfile] = useState<RecordingAudioProfile>(DEFAULT_RECORDING_AUDIO_PROFILE);
  const [languageMode, setLanguageMode] = useState<TranscriptionLanguageMode>('auto');
  const [hotwords, setHotwords] = useState<string>('');
  const [preparation, setPreparation] = useState<RecorderPreparation | null>(
    null,
  );
  const [deviceState, setDeviceState] = useState<RecorderDeviceState>({
    muted: false,
    state: 'checking',
  });
  const [metrics, setMetrics] = useState<RecorderMetrics>({
    clipCount: 0,
    inputDetected: false,
    peak: 0,
    rms: 0,
    silentForMs: 0,
  });
  const [durationMs, setDurationMs] = useState<number>(0);
  const [recordingBytes, setRecordingBytes] = useState<number>(0);
  const [chunkCount, setChunkCount] = useState<number>(0);
  const [recordingFile, setRecordingFile] = useState<File | null>(null);
  const [recordingUrl, setRecordingUrl] = useState<string | null>(null);
  const [integrityCheck, setIntegrityCheck] =
    useState<RecordingIntegrityCheck | null>(null);
  const [integrityChecking, setIntegrityChecking] = useState<boolean>(false);
  const [integrityConfirmed, setIntegrityConfirmed] =
    useState<boolean>(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [storageReady, setStorageReady] = useState<boolean>(false);
  const [recoverable, setRecoverable] = useState<RecoverableRecording | null>(
    null,
  );
  const [readiness, setReadiness] = useState<SystemReadiness | null>(null);
  const [preparing, setPreparing] = useState<boolean>(false);
  const [stopping, setStopping] = useState<boolean>(false);
  const [uploading, setUploading] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [job, setJob] = useState<NoteJob | null>(null);
  const [error, setError] = useState<string | null>(null);
  const shownTranscriptionNoticeRef = useRef<string | null>(null);
  const recorderRef = useRef<ReliableRecorder | null>(null);
  const uploadAbortRef = useRef<AbortController | null>(null);
  const latestObjectUrlRef = useRef<string | null>(null);
  const handledResultSessionRef = useRef<string | null>(null);

  const handleRecordingResult = async (
    result: RecordingResult,
  ): Promise<void> => {
    if (handledResultSessionRef.current === result.sessionId) return;
    handledResultSessionRef.current = result.sessionId;
    setIntegrityChecking(true);
    setIntegrityCheck(null);
    setIntegrityConfirmed(false);
    const fileName: string = buildRecordingFileName(title, result.mimeType);
    const file: File = new File([result.file], fileName, {
      type: result.mimeType,
    });
    if (latestObjectUrlRef.current) {
      URL.revokeObjectURL(latestObjectUrlRef.current);
    }
    latestObjectUrlRef.current = URL.createObjectURL(file);
    setRecordingUrl(latestObjectUrlRef.current);
    setRecordingFile(file);
    setSessionId(result.sessionId);
    setDurationMs(result.durationMs);
    setRecordingBytes(result.bytes);
    setChunkCount(result.chunkCount);
    try {
      const nextIntegrityCheck: RecordingIntegrityCheck =
        await validateRecordingFile(file, result.durationMs);
      setIntegrityCheck(nextIntegrityCheck);
      if (nextIntegrityCheck.status === 'failed') {
        toast.error('录音文件完整性检查未通过，请重新录音');
      } else {
        toast.success('录音已保存并完成完整性检查，请先试听确认');
      }
    } finally {
      setIntegrityChecking(false);
      setPhase('review');
      recorderRef.current?.release();
    }
  };

  if (!recorderRef.current) {
    recorderRef.current = new ReliableRecorder({
      onChunk: (bytes: number, chunks: number) => {
        setRecordingBytes(bytes);
        setChunkCount(chunks);
      },
      onDeviceState: (state: RecorderDeviceState) => setDeviceState(state),
      onError: (nextError: Error) => {
        setError(nextError.message);
        setDeviceState({ muted: false, state: 'error' });
        setPhase((current: RecordingPhase) =>
          current === 'recording' ? 'paused' : current,
        );
      },
      onMetrics: (nextMetrics: RecorderMetrics) => setMetrics(nextMetrics),
      onAutoStop: (result: RecordingResult) => {
        setStopping(true);
        void handleRecordingResult(result)
          .catch((autoStopError: unknown) => {
            const message: string = getErrorMessage(autoStopError);
            setError(message);
            toast.error(message);
          })
          .finally(() => setStopping(false));
      },
      onStorageWarning: () => {
        setStorageReady(false);
        setError('录音保护存储中断，已暂停录音，请先完成当前录音再离开页面');
        setPhase((current: RecordingPhase) =>
          ['recording', 'paused'].includes(current) ? 'paused' : current,
        );
        toast.error('录音保护存储中断，已暂停录音');
      },
    });
  }

  const recorder: ReliableRecorder = recorderRef.current;
  const qualityLevel: QualityLevel =
    deviceState.state === 'ended' || deviceState.state === 'error'
      ? 'poor'
      : deviceState.state === 'muted' ||
          metrics.clipCount > 0 ||
          metrics.silentForMs > SILENCE_WARNING_MS
        ? 'warning'
        : metrics.inputDetected
          ? 'good'
          : 'poor';
  const qualityCopy = getQualityCopy(qualityLevel);
  const running: boolean = Boolean(
    job && !['completed', 'cancelled', 'failed'].includes(job.stage),
  );
  const canStart: boolean =
    deviceState.state === 'ready' &&
    metrics.inputDetected &&
    storageReady &&
    !recoverable &&
    !preparing;
  const canConvert: boolean = Boolean(
    recordingFile &&
      durationMs >= MIN_RECORDING_DURATION_MS &&
      recordingBytes > 0 &&
      chunkCount > 0 &&
      !integrityChecking &&
      Boolean(
        integrityCheck &&
          (integrityCheck.status === 'passed' ||
            (integrityCheck.status === 'review' && integrityConfirmed)),
      ) &&
      !uploading &&
      !running,
  );
  const asrLabel: string = job
    ? getTranscriptionProviderLabel(job.transcriptionProvider)
    : readiness
      ? '等待任务返回实际引擎'
      : '检测中';

  useEffect(() => {
    let cancelled = false;
    void checkRecordingStorage()
      .then(() => {
        if (!cancelled) setStorageReady(true);
      })
      .catch(() => {
        if (!cancelled) {
          setStorageReady(false);
          setError('当前浏览器无法启用录音恢复存储，暂不允许开始录音');
        }
      });
    void getReadiness()
      .then((next: SystemReadiness) => {
        if (!cancelled) setReadiness(next);
      })
      .catch(() => undefined);
    void loadLatestStoredRecording()
      .then((next: RecoverableRecording | null) => {
        if (!cancelled) setRecoverable(next);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!['recording', 'paused'].includes(phase)) return undefined;
    const timer: number = window.setInterval(() => {
      setDurationMs(recorder.getDurationMs());
    }, 250);
    return () => window.clearInterval(timer);
  }, [phase, recorder]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent): void => {
      const activeSession: boolean =
        ['recording', 'paused'].includes(phase) || uploading || running;
      if (activeSession) {
        event.preventDefault();
        event.returnValue = '当前录音尚未完成，确定要离开吗？';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [phase, running, uploading]);

  useEffect(() => {
    const handleVisibilityChange = (): void => {
      if (document.visibilityState !== 'hidden') return;
      if (['recording', 'paused'].includes(phase)) {
        toast.warning('页面已切到后台，录音仍在继续，请尽快返回确认设备状态');
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () =>
      document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [phase]);

  useEffect(() => {
    if (!job || !running) return undefined;
    let cancelled = false;
    let timer: number | undefined;
    const poll = async (): Promise<void> => {
      try {
        const next: NoteJob = await getNoteJob(job.id);
        if (cancelled) return;
        setJob(next);
        if (next.stage === 'failed') {
          setError(next.error || '转化失败，录音文件仍然保留，可以重新提交');
          setPhase('review');
        }
      } catch {
        // Polling can recover on the next tick without interrupting the server task.
      } finally {
        if (!cancelled) timer = window.setTimeout(poll, 1_800);
      }
    };
    timer = window.setTimeout(poll, 1_000);
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [job?.id, running]);

  useEffect(() => {
    const notice: string | undefined = job?.transcriptionNotice;
    if (!notice || shownTranscriptionNoticeRef.current === notice) return;
    shownTranscriptionNoticeRef.current = notice;
    toast.warning(notice);
  }, [job?.transcriptionNotice]);

  useEffect(
    () => () => {
      uploadAbortRef.current?.abort();
      recorder.release();
      if (latestObjectUrlRef.current) {
        URL.revokeObjectURL(latestObjectUrlRef.current);
      }
    },
    [recorder],
  );

  const prepareMicrophone = async (): Promise<void> => {
    setPreparing(true);
    setError(null);
    try {
      const nextPreparation: RecorderPreparation = await recorder.prepare(audioProfile);
      setPreparation(nextPreparation);
      toast.success('麦克风已连接，请说一句话完成声音测试');
    } catch (prepareError: unknown) {
      const message: string =
        prepareError instanceof DOMException
          ? getMicrophoneErrorMessage(prepareError)
          : getErrorMessage(prepareError);
      setError(message);
      toast.error(message);
    } finally {
      setPreparing(false);
    }
  };

  const startRecording = async (): Promise<void> => {
    if (recoverable) {
      toast.warning('请先恢复或丢弃上次未完成的录音，再开始新的录音');
      return;
    }
    if (!storageReady) {
      toast.error('录音保护存储未就绪，暂不能开始录音');
      return;
    }
    if (!preparation) await prepareMicrophone();
    if (!canStart) {
      toast.error('请先完成麦克风声音测试，并确认声音输入清晰');
      return;
    }
    setError(null);
    setRecordingBytes(0);
    setChunkCount(0);
    setDurationMs(0);
    handledResultSessionRef.current = null;
    try {
      await recorder.start(title);
      setPhase('recording');
      toast.success('录音已开始，页面会持续检查声音和设备状态');
    } catch (startError: unknown) {
      const message: string = getErrorMessage(startError);
      setError(message);
      toast.error(message);
    }
  };

  const pauseRecording = (): void => {
    recorder.pause();
    setPhase('paused');
  };

  const resumeRecording = (): void => {
    if (!storageReady) {
      toast.error('录音保护存储已中断，请先完成当前录音或重新开始');
      return;
    }
    if (deviceState.state !== 'ready') {
      toast.error('麦克风当前不可用，请重新检测设备');
      return;
    }
    recorder.resume();
    setPhase('recording');
  };

  const stopRecording = async (): Promise<void> => {
    const currentDurationMs: number = recorder.getDurationMs();
    setDurationMs(currentDurationMs);
    if (currentDurationMs < MIN_RECORDING_DURATION_MS) {
      toast.error('录音至少需要 3 秒，避免得到空文件');
      return;
    }
    setStopping(true);
    try {
      const result: RecordingResult = await recorder.stop();
      await handleRecordingResult(result);
    } catch (stopError: unknown) {
      const message: string = getErrorMessage(stopError);
      setError(message);
      toast.error(message);
    } finally {
      setStopping(false);
    }
  };

  const recoverRecording = async (): Promise<void> => {
    if (!recoverable) return;
    const fileName: string = buildRecordingFileName(
      recoverable.title,
      recoverable.mimeType,
    );
    const file: File = new File([recoverable.blob], fileName, {
      type: recoverable.mimeType,
    });
    if (latestObjectUrlRef.current) URL.revokeObjectURL(latestObjectUrlRef.current);
    latestObjectUrlRef.current = URL.createObjectURL(file);
    setRecordingUrl(latestObjectUrlRef.current);
    setRecordingFile(file);
    setSessionId(recoverable.sessionId);
    setTitle(recoverable.title);
    setDurationMs(recoverable.durationMs);
    setRecordingBytes(file.size);
    setChunkCount(recoverable.chunkCount);
    setRecoverable(null);
    setPhase('review');
    setIntegrityChecking(true);
    setIntegrityConfirmed(false);
    try {
      const nextIntegrityCheck: RecordingIntegrityCheck =
        await validateRecordingFile(file, recoverable.durationMs);
      setIntegrityCheck(nextIntegrityCheck);
    } catch (validationError: unknown) {
      setIntegrityCheck({
        measuredDurationMs: null,
        message: getErrorMessage(validationError),
        status: 'failed',
      });
    } finally {
      setIntegrityChecking(false);
    }
    toast.success(
      recoverable.interrupted
        ? '已恢复上次意外中断的录音，最后一个分片可能尚未写入'
        : '已恢复上次未转化的录音',
    );
  };

  const discardRecording = async (): Promise<void> => {
    const id: string | undefined = recoverable?.sessionId || sessionId || undefined;
    if (id) await deleteStoredRecording(id).catch(() => undefined);
    if (latestObjectUrlRef.current) URL.revokeObjectURL(latestObjectUrlRef.current);
    latestObjectUrlRef.current = null;
    setRecoverable(null);
    setRecordingFile(null);
    setRecordingUrl(null);
    setSessionId(null);
    setRecordingBytes(0);
    setChunkCount(0);
    setDurationMs(0);
    setIntegrityCheck(null);
    setIntegrityChecking(false);
    setIntegrityConfirmed(false);
    setPhase('setup');
  };

  const convertToNote = async (): Promise<void> => {
    if (!recordingFile || !canConvert) {
      toast.error('请先完成至少 3 秒录音并试听确认');
      return;
    }
    if (readiness && !readiness.mediaReady) {
      toast.error('当前处理环境未就绪，请先检查转录配置');
      return;
    }
    setError(null);
    setPhase('processing');
    setUploading(true);
    setUploadProgress(0);
    const controller: AbortController = new AbortController();
    uploadAbortRef.current = controller;
    let uploaded: UploadFileData[] = [];
    try {
      const uploads: UploadFileData[] = await uploadMediaFile(
        recordingFile,
        (progress: MediaUploadProgress) => {
          setUploadProgress(
            Math.round((progress.uploadedBytes / Math.max(progress.totalBytes, 1)) * 100),
          );
        },
        { signal: controller.signal },
      );
      uploaded = uploads;
      const media: UploadedMediaInput = {
        downloadUrl: uploads[0].url,
        fileName: recordingFile.name,
        fileSize: recordingFile.size,
        mimeType: recordingFile.type || 'audio/webm',
        storage:
          uploads.length === 1 ? toStoredSourceObject(uploads[0]) : undefined,
        parts:
          uploads.length > 1
            ? uploads.map((part: UploadFileData) => ({
                downloadUrl: part.url,
                fileSize: part.fileSize,
                storage: toStoredSourceObject(part),
              }))
            : undefined,
      };
      const created: NoteJob = await createNoteJob({
        mediaItems: [media],
        noteStyle,
        sourceType: 'audio',
        transcriptionOptions: {
          languageMode,
          hotwords: hotwords.split(/[,，\n]/u).map((item) => item.trim()).filter(Boolean).slice(0, 128),
        },
        visualOptions: { mode: 'disabled' },
      });
      setJob(created);
      if (created.stage === 'failed') {
        const message: string = created.error || '转化失败，录音文件仍然保留';
        setError(message);
        setPhase('review');
        toast.error(message);
      } else {
        if (sessionId) {
          await deleteStoredRecording(sessionId).catch(() => undefined);
        }
        toast.success('录音已提交，正在生成笔记');
      }
    } catch (convertError: unknown) {
      if (uploaded.length > 0) await deleteUploadedFiles(uploaded).catch(() => undefined);
      const message: string = getErrorMessage(convertError);
      setError(message);
      setPhase('review');
      toast.error(message);
    } finally {
      uploadAbortRef.current = null;
      setUploading(false);
    }
  };

  const cancelProcessing = async (): Promise<void> => {
    uploadAbortRef.current?.abort();
    if (job && running) {
      try {
        await cancelNoteJob(job.id);
        setJob(null);
        setPhase('review');
        toast.success('已停止处理，录音文件仍保留');
      } catch (cancelError: unknown) {
        const message: string = getErrorMessage(cancelError);
        setError(`停止处理失败：${message}`);
        toast.error('停止处理失败，任务可能仍在后台运行');
      }
      return;
    }
    if (uploading && !job) setPhase('review');
    setUploading(false);
  };

  const downloadBackup = (): void => {
    if (!recordingFile || !recordingUrl) return;
    const anchor: HTMLAnchorElement = document.createElement('a');
    anchor.href = recordingUrl;
    anchor.download = recordingFile.name;
    anchor.click();
    toast.success('录音备份已开始下载');
  };

  const handleBackToHome = (event: MouseEvent<HTMLAnchorElement>): void => {
    const unsavedRecording: boolean = Boolean(
      ['recording', 'paused'].includes(phase) || uploading || running,
    );
    if (unsavedRecording) {
      event.preventDefault();
      toast.warning('当前录音尚未完成，请先试听或完成保存后再离开');
    }
  };

  const resetPage = async (): Promise<void> => {
    await discardRecording();
    setJob(null);
    setError(null);
    setPreparation(null);
    setDeviceState({ muted: false, state: 'checking' });
    setMetrics({ clipCount: 0, inputDetected: false, peak: 0, rms: 0, silentForMs: 0 });
  };

  const signalWidth: number = Math.min(100, Math.max(2, metrics.rms * 320));
  const qualityColor: string =
    qualityLevel === 'good'
      ? 'text-emerald-700'
      : qualityLevel === 'warning'
        ? 'text-amber-700'
        : 'text-red-700';

  return (
    <main className="min-h-screen bg-[#eef2f6] text-[#111827]">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-5 py-6 md:px-10 md:py-8">
        <header className="flex items-center justify-between gap-4 border-b border-black/10 pb-5">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-lg bg-[#111827] text-white shadow-sm">
              <Mic2 className="size-5" />
            </span>
            <span>
              <strong className="block text-sm">实时录音笔记</strong>
              <small className="mt-1 block text-xs text-black/45">
                录音、试听、转录、整理
              </small>
            </span>
          </div>
          <Link
            className="inline-flex items-center gap-2 rounded-md border border-black/10 bg-white/75 px-3 py-2 text-xs font-semibold text-black/60 transition hover:border-blue-300 hover:text-blue-700"
            onClick={handleBackToHome}
            to="/"
          >
            <ArrowLeft className="size-4" />
            返回入口
          </Link>
        </header>

        <section className="grid flex-1 gap-6 py-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(300px,.65fr)]">
          <div className="rounded-xl border border-black/10 bg-white/90 p-6 shadow-[0_18px_42px_rgba(15,23,42,.08)] md:p-8">
            {phase === 'setup' && (
              <SetupPanel
                audioProfile={audioProfile}
                canStart={canStart}
                hotwords={hotwords}
                languageMode={languageMode}
                noteStyle={noteStyle}
                onDiscardRecovery={() => void discardRecording()}
                onAudioProfileChange={(value: RecordingAudioProfile) => {
                  setAudioProfile(value);
                  setPreparation(null);
                }}
                onHotwordsChange={setHotwords}
                onLanguageModeChange={setLanguageMode}
                onNoteStyleChange={setNoteStyle}
                onPrepare={() => void prepareMicrophone()}
                onRecover={recoverRecording}
                onStart={() => void startRecording()}
                onTitleChange={setTitle}
                preparing={preparing}
                recoverable={recoverable}
                storageReady={storageReady}
                title={title}
              />
            )}

            {(phase === 'recording' || phase === 'paused') && (
              <RecordingPanel
                chunkCount={chunkCount}
                deviceState={deviceState}
                durationMs={durationMs}
                metrics={metrics}
                onPause={pauseRecording}
                onResume={resumeRecording}
                onStop={() => void stopRecording()}
                phase={phase}
                qualityColor={qualityColor}
                qualityDescription={qualityCopy.description}
                qualityLabel={qualityCopy.label}
                recordingBytes={recordingBytes}
                signalWidth={signalWidth}
                storageReady={storageReady}
                stopping={stopping}
                title={title}
              />
            )}

            {phase === 'review' && recordingFile && (
              <ReviewPanel
                canConvert={canConvert}
                chunkCount={chunkCount}
                durationMs={durationMs}
                integrityCheck={integrityCheck}
                integrityConfirmed={integrityConfirmed}
                integrityChecking={integrityChecking}
                onConvert={() => void convertToNote()}
                onDownloadBackup={downloadBackup}
                onIntegrityConfirm={setIntegrityConfirmed}
                onReset={() => void resetPage()}
                recordingFile={recordingFile}
                recordingUrl={recordingUrl}
              />
            )}

            {phase === 'processing' && (
              <ProcessingPanel
                error={error}
                job={job}
                onCancel={() => void cancelProcessing()}
                onReset={() => void resetPage()}
                progress={uploading ? uploadProgress : job?.progress || 0}
                uploading={uploading}
              />
            )}

            {error && phase !== 'processing' && (
              <div className="mt-6 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-800">
                <XCircle className="mt-0.5 size-5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>

          <aside className="space-y-4">
            <section className="rounded-xl border border-black/10 bg-white/80 p-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-bold">录音质量保障</h2>
                <span className={`text-xs font-semibold ${qualityColor}`}>{qualityCopy.label}</span>
              </div>
              <div className="mt-4 space-y-3">
                <StatusLine label="麦克风权限" value={preparation ? '已允许' : '待检测'} />
                <StatusLine label="设备连接" value={deviceState.state === 'ready' ? '正常' : deviceState.state === 'muted' ? '已静音' : '待检测'} />
                <StatusLine
                  label="采样参数"
                  value={
                    preparation
                      ? `${preparation.sampleRate || '未知'} Hz · ${preparation.channelCount} 声道`
                      : '待检测'
                  }
                />
                <StatusLine label="声音输入" value={metrics.inputDetected ? '已检测到' : '请说话测试'} />
                <StatusLine label="本地恢复" value={storageReady ? '每秒保存分片' : '仅当前页面内存'} />
              </div>
            </section>
            <section className="rounded-xl border border-black/10 bg-white/80 p-5">
              <h2 className="text-sm font-bold">当前处理配置</h2>
              <p className="mt-2 text-xs leading-5 text-black/45">
                系统会优先使用已配置的云端 ASR；未启用或不可用时自动使用本地 Whisper 兜底。
              </p>
              <div className="mt-4 space-y-3">
                <StatusLine label="转录引擎" value={asrLabel} />
                <StatusLine label="说话人分离" value="沿用系统配置" />
                <StatusLine label="处理环境" value={readiness?.mediaReady ? '已就绪' : readiness ? '需检查' : '检测中'} />
              </div>
              <Link className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-800" to="/transcription-settings">
                查看转录配置
                <ArrowUpRight className="size-3.5" />
              </Link>
            </section>
            <section className="rounded-xl border border-blue-100 bg-blue-50/70 p-5 text-xs leading-5 text-blue-950">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-blue-700" />
                <p>浏览器切到后台、麦克风被系统静音或设备断开时，页面会立即提示。录音不会静默失败。</p>
              </div>
            </section>
          </aside>
        </section>
      </div>
    </main>
  );
}
