import { Fragment, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  FileAudio,
  FilePenLine,
  Info,
  LoaderCircle,
  Mic2,
  Pause,
  Play,
  RefreshCcw,
  ShieldCheck,
  SlidersHorizontal,
  Square,
  TriangleAlert,
  UploadCloud,
  Volume2,
} from 'lucide-react';

import NoteStyleSelector from '@/components/NoteStyleSelector';
import RecordingAudioPlayer from '@/components/RecordingAudioPlayer';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { formatFileSize } from '@/utils/file-size';
import {
  getSmartPlaybackSummary,
  type RecordingAudioAnalysis,
} from '@/utils/recording-audio-analysis';
import type { NoteJob, NoteStyle } from '@shared/api.interface';
import type { TranscriptionLanguageMode } from '@shared/api.interface';
import {
  type RecordingAudioProfile,
  formatRecordingBytes,
  formatRecordingDuration,
  getRecordingCaptureModeDefinition,
  type RecordingCaptureMode,
  type RecordingIntegrityCheck,
} from './recording-note.utils';
import {
  getRecordingProcessStageIndex,
  getTranscriptionProviderLabel,
  RECORDING_PROCESS_STAGES,
} from './recording-processing.utils';
import type { RecoverableRecording } from './recording-storage';
import type {
  RecorderDeviceState,
  RecorderMetrics,
  RecorderPreparation,
} from './reliable-recorder';

type ActiveRecordingPhase = 'recording' | 'paused';

interface SetupPanelProps {
  audioProfile: RecordingAudioProfile;
  advancedOpen: boolean;
  canStart: boolean;
  captureMode: RecordingCaptureMode;
  deviceState: RecorderDeviceState;
  error: string | null;
  hotwords: string;
  languageMode: TranscriptionLanguageMode;
  metrics: RecorderMetrics;
  noteStyle: NoteStyle;
  onDiscardRecovery: () => void;
  onAudioProfileChange: (value: RecordingAudioProfile) => void;
  onCaptureModeChange: (value: RecordingCaptureMode) => void;
  onAdvancedToggle: () => void;
  onHotwordsChange: (value: string) => void;
  onLanguageModeChange: (value: TranscriptionLanguageMode) => void;
  onNoteStyleChange: (value: NoteStyle) => void;
  onPrepare: () => void;
  onRecover: () => void;
  onStart: () => void;
  onTitleChange: (value: string) => void;
  preparing: boolean;
  preparation: RecorderPreparation | null;
  recoverable: RecoverableRecording | null;
  storageReady: boolean;
  title: string;
}

interface RecordingPanelProps {
  chunkCount: number;
  deviceState: RecorderDeviceState;
  durationMs: number;
  metrics: RecorderMetrics;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  phase: ActiveRecordingPhase;
  qualityColor: string;
  qualityDescription: string;
  qualityLabel: string;
  recordingBytes: number;
  signalWidth: number;
  storageReady: boolean;
  stopping: boolean;
  title: string;
}

interface ReviewPanelProps {
  audioAnalysis: RecordingAudioAnalysis | null;
  canConvert: boolean;
  chunkCount: number;
  durationMs: number;
  integrityCheck: RecordingIntegrityCheck | null;
  integrityConfirmed: boolean;
  integrityChecking: boolean;
  onConvert: () => void;
  onDownloadBackup: () => void;
  onIntegrityConfirm: (checked: boolean) => void;
  onReset: () => void;
  recordingFile: File;
  recordingUrl: string | null;
}

interface ProcessingPanelProps {
  error: string | null;
  job: NoteJob | null;
  onCancel: () => void;
  onReset: () => void;
  progress: number;
  uploading: boolean;
}

type RecordingStepPhase = 'setup' | 'recording' | 'paused' | 'review' | 'processing';

export function RecordingStepRail({ phase }: { phase: RecordingStepPhase }) {
  const activeStep: number =
    phase === 'setup' ? 0 : phase === 'recording' || phase === 'paused' ? 1 : 2;
  return (
    <nav aria-label={`当前步骤：${['准备', '录音', '确认'][activeStep]}`} className="recording-step-rail">
      {['准备', '录音', '确认'].map((label: string, index: number) => (
        <Fragment key={label}>
          <div className={`recording-step ${index < activeStep ? 'is-done' : ''}`}>
            <span className={`recording-step__node ${index < activeStep ? 'is-done' : index === activeStep ? 'is-active' : ''}`}>
              {index < activeStep ? <Check className="size-4" /> : index + 1}
            </span>
            <span className={index === activeStep ? 'is-active' : ''}>{label}</span>
          </div>
          {index < 2 && (
            <span className={`recording-step-arrow ${index < activeStep ? 'is-done' : ''}`} aria-hidden="true">
              <ChevronRight className="size-5" />
            </span>
          )}
        </Fragment>
      ))}
    </nav>
  );
}

export function SetupPanel({
  audioProfile,
  advancedOpen,
  canStart,
  captureMode,
  deviceState,
  error,
  hotwords,
  languageMode,
  metrics,
  noteStyle,
  onDiscardRecovery,
  onAudioProfileChange,
  onCaptureModeChange,
  onAdvancedToggle,
  onHotwordsChange,
  onLanguageModeChange,
  onNoteStyleChange,
  onPrepare,
  onRecover,
  onStart,
  onTitleChange,
  preparing,
  preparation,
  recoverable,
  storageReady,
  title,
}: SetupPanelProps) {
  const captureDefinition = getRecordingCaptureModeDefinition(captureMode);
  const micSignalReady: boolean =
    metrics.inputDetected && deviceState.state === 'ready';
  const micState: 'idle' | 'checking' | 'listening' | 'success' | 'error' =
    preparing
      ? 'checking'
      : ['error', 'ended', 'muted'].includes(deviceState.state)
        ? 'error'
        : micSignalReady
          ? 'success'
          : preparation
            ? 'listening'
            : 'idle';
  const micStep: number =
    micState === 'success' ? 2 : micState === 'listening' ? 1 : 0;
  const meterPercent: number = Math.min(100, Math.max(0, metrics.rms * 600));
  const meterActiveBars: number = Math.round((meterPercent / 100) * 30);
  const micTitle: string = {
    idle: `先检测${captureDefinition.label}`,
    checking: `正在连接${captureDefinition.label}…`,
    listening: captureDefinition.signalStep,
    success: canStart
      ? '声音已检测到，可以开始录音'
      : recoverable
        ? '声音已检测到，请先处理上次录音'
        : !storageReady
          ? '声音已检测到，正在准备录音…'
          : '声音已检测到，请稍候…',
    error: `${captureDefinition.label}暂时不可用`,
  }[micState];
  const micDescription: string = {
    idle: captureDefinition.idleDescription,
    checking: captureDefinition.permissionDescription,
    listening: captureDefinition.waitingDescription,
    success: captureDefinition.successDescription,
    error: error || captureDefinition.errorFallback,
  }[micState];
  const micTone: string = `recording-mic-test--${micState}`;
  const micButtonLabel: string =
    micState === 'checking'
      ? `正在检测${captureDefinition.label}`
      : micState === 'idle'
        ? `检测${captureDefinition.label}`
        : '重新检测';
  const processingCopy: string | null = !preparation
    ? null
    : captureMode === 'system'
      ? '电脑声音按浏览器共享来源录制，不会套用麦克风降噪。'
      : audioProfile === 'fidelity'
        ? '原声保留：未请求浏览器降噪、回声消除或自动增益。'
        : preparation.noiseSuppression && preparation.echoCancellation
          ? audioProfile === 'noisy' && preparation.autoGainControl
            ? '强噪增强已生效：浏览器已启用降噪、回声消除和自动增益。'
            : '会议清晰已生效：浏览器已启用降噪和回声消除。'
          : '当前设备未完整支持所选声音优化，已使用兼容录音模式。';

  return (
    <div className="recording-setup">
      {recoverable && (
        <div className="recording-recovery" role="alert">
          <div>
            <strong>发现上次未完成的录音</strong>
            <span>{formatRecordingDuration(recoverable.durationMs)} · 建议先恢复再开始新的录音</span>
          </div>
          <div className="recording-recovery__actions">
            <Button onClick={onRecover} size="sm">恢复录音</Button>
            <Button onClick={onDiscardRecovery} size="sm" variant="outline">丢弃</Button>
          </div>
        </div>
      )}

      <section className={`recording-mic-test ${micTone}`} data-mic-state={micState}>
        <div className="recording-mic-test__header">
          <div>
            <p className="recording-section-label">声音检测</p>
            <h2 aria-live="polite">{micTitle}</h2>
            <p>{micDescription}</p>
          </div>
          <Button
            className="recording-mic-test__button"
            data-ai-section-type="button"
            disabled={preparing}
            onClick={onPrepare}
            type="button"
          >
            {preparing ? <LoaderCircle className="animate-spin" /> : <Mic2 />}
            {micButtonLabel}
          </Button>
        </div>

        <div className="recording-mic-steps" aria-label="声音检测进度">
          {[captureDefinition.connectionStep, captureDefinition.signalStep, '可以开始'].map((label: string, index: number) => (
            <div className="recording-mic-step" key={label}>
              <span
                className={`recording-mic-step__node ${
                  index < micStep ? 'is-done' : index === micStep ? 'is-active' : ''
                }`}
              >
                {index < micStep ? <Check className="size-4" /> : index + 1}
              </span>
              <span>
                <strong>{label}</strong>
                <small>
                  {index === 0
                    ? micStep > 0
                      ? '来源已连接'
                      : '等待连接'
                    : index === 1
                      ? micStep > 1
                        ? '所选声音输入正常'
                        : micStep === 1
                          ? '正在监听声音'
                          : '待完成'
                      : micStep === 2
                        ? '检测通过'
                        : '待完成'}
                </small>
              </span>
              {index < 2 && (
                <i className={index < micStep ? 'is-done' : ''} aria-hidden="true" />
              )}
            </div>
          ))}
        </div>

        <div
          aria-live="polite"
          className={`recording-meter-row ${micSignalReady ? 'is-detected' : ''}`}
        >
          <span className="recording-meter-label"><Mic2 className="size-5" />实时音量</span>
          <div className="recording-meter" aria-label={`实时音量 ${Math.round(meterPercent)}%`}>
            {Array.from({ length: 30 }, (_, index: number) => (
              <i
                className={index < meterActiveBars ? 'is-on' : ''}
                key={index}
                style={{ height: `${8 + ((index * 7) % 14)}px` }}
              />
            ))}
          </div>
          <span className={`recording-meter-status ${micState === 'success' ? 'is-success' : ''}`}>
            {micState === 'success'
              ? '已检测到声音'
              : micState === 'listening'
                ? '正在监听'
                : '等待输入'}
          </span>
          <span className="recording-meter-level" aria-label={`当前音量 ${Math.round(meterPercent)}%`}>
            {Math.round(meterPercent)}%
          </span>
        </div>
        {micState === 'listening' && (
          <p className="recording-inline-tip"><Info className="size-4" />请靠近麦克风说话，看到绿色音量条再开始。</p>
        )}
        {micState === 'error' && (
          <p className="recording-inline-tip is-error"><TriangleAlert className="size-4" />{micDescription}</p>
        )}
        {preparation?.deviceLabel && micState === 'success' && (
          <p className="recording-device-copy">当前设备：{preparation.deviceLabel}</p>
        )}
        {processingCopy && (
          <p className="recording-device-copy">声音优化：{processingCopy}</p>
        )}
      </section>

      <section className="recording-config-panel" aria-labelledby="recording-config-title">
        <div className="recording-config-heading">
          <div>
            <p className="recording-section-label">录音设置</p>
            <h2 id="recording-config-title">先把这段录音准备好</h2>
          </div>
          <span className="recording-config-count">1 / 2</span>
        </div>

        <div className="recording-form-grid">
          <label className="recording-field">
            <span>录音标题</span>
            <div className="recording-input-wrap">
              <FilePenLine className="size-4" />
              <Input
                aria-label="录音标题"
                className="h-11 border-0 bg-transparent px-0 shadow-none focus-visible:ring-0"
                maxLength={80}
                onChange={(event) => onTitleChange(event.target.value)}
                value={title}
              />
              <small>{title.length}/80</small>
            </div>
          </label>
          <div className="recording-field">
            <NoteStyleSelector value={noteStyle} onChange={onNoteStyleChange} />
          </div>
        </div>

        <button
          aria-expanded={advancedOpen}
          className="recording-advanced-toggle"
          onClick={onAdvancedToggle}
          type="button"
        >
          <span><SlidersHorizontal className="size-4" /><strong>高级设置</strong><small>录音模式、语言、词表</small></span>
          {advancedOpen ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </button>
        {advancedOpen && <div className="recording-advanced-panel">
          <div className="recording-field recording-field--full">
            <span>录音来源</span>
            <div className="recording-capture-options" role="radiogroup" aria-label="录音来源">
              {(['microphone', 'system', 'mixed'] as RecordingCaptureMode[]).map((mode: RecordingCaptureMode) => {
                const definition = getRecordingCaptureModeDefinition(mode);
                const selected: boolean = captureMode === mode;
                return (
                  <Button
                    aria-checked={selected}
                    className={`recording-capture-option ${selected ? 'is-selected' : ''}`}
                    key={mode}
                    onClick={() => onCaptureModeChange(mode)}
                    role="radio"
                    type="button"
                    variant="outline"
                  >
                    {mode === 'system' ? <Volume2 className="size-4" /> : <Mic2 className="size-4" />}
                    {definition.label}
                  </Button>
                );
              })}
            </div>
            {captureMode !== 'microphone' && (
              <small className="recording-capture-note">
                通过浏览器共享音频获取；共享窗口中需勾选“共享音频”，录音不会保存画面。
              </small>
            )}
          </div>
          <label className="recording-field">
            <span>录音模式</span>
            <Select onValueChange={(value: string) => onAudioProfileChange(value as RecordingAudioProfile)} value={audioProfile}>
              <SelectTrigger className="h-11 w-full border-black/10 bg-white font-normal text-black/75"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="fidelity">原声保真（方言/安静环境）</SelectItem>
                <SelectItem value="clarity">会议清晰（回声/多人环境）</SelectItem>
                <SelectItem value="noisy">强噪增强（风扇/街道）</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <label className="recording-field">
            <span>语言模式</span>
            <Select onValueChange={(value: string) => onLanguageModeChange(value as TranscriptionLanguageMode)} value={languageMode}>
              <SelectTrigger className="h-11 w-full border-black/10 bg-white font-normal text-black/75"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">自动识别（推荐）</SelectItem>
                <SelectItem value="mandarin">普通话</SelectItem>
                <SelectItem value="sichuan">四川话增强</SelectItem>
                <SelectItem value="cantonese">粤语</SelectItem>
                <SelectItem value="mixed">普通话 + 英语/方言混说</SelectItem>
              </SelectContent>
            </Select>
          </label>
          <label className="recording-field recording-field--full">
            <span>词表（可选）</span>
            <Input className="h-11 border-black/10 bg-white text-sm font-normal" value={hotwords} onChange={(event) => onHotwordsChange(event.target.value)} placeholder="人名、项目名、术语，用逗号分隔" />
          </label>
        </div>}
      </section>

      <div className="recording-primary-action">
        <Button
          className="recording-start-button"
          data-ai-section-type="button"
          disabled={!canStart}
          onClick={onStart}
          type="button"
        >
          <Mic2 className="size-5" />开始录音
        </Button>
        <p className="recording-start-hint">
          {canStart
            ? '准备完成，可以开始录音'
            : micState === 'idle'
              ? `请先点击上方“检测${captureDefinition.label}”`
              : micState === 'checking'
                ? '正在连接设备，请稍候…'
                : micState === 'listening'
                  ? '请说一句话，确认有声音输入'
                : micState === 'error'
                  ? `${captureDefinition.label}不可用，请重新检测`
                  : recoverable
                    ? '请先恢复或丢弃上次未完成的录音'
                    : storageReady
                      ? '检测通过后才可开始录音'
                      : '录音保护存储未就绪，暂不能开始'}
        </p>
      </div>
      {!storageReady && <p className="recording-storage-error"><AlertTriangle className="size-4" />录音保护存储不可用，暂不允许开始录音。</p>}
    </div>
  );
}

export function RecordingPanel({
  chunkCount,
  deviceState,
  durationMs,
  metrics,
  onPause,
  onResume,
  onStop,
  phase,
  qualityColor,
  qualityDescription,
  qualityLabel,
  recordingBytes,
  signalWidth,
  storageReady,
  stopping,
  title,
}: RecordingPanelProps) {
  const liveMeterPercent: number = Math.min(100, Math.max(0, signalWidth));
  const liveMeterBars: number = Math.round((liveMeterPercent / 100) * 28);

  return (
    <div className="recording-live-panel">
      <div className="recording-live-panel__header flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.12em] text-blue-700">
            {phase === 'recording' ? '正在录音' : '录音已暂停'}
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-[-.04em]">
            {title || '未命名录音'}
          </h1>
        </div>
        <span className="recording-live-panel__duration rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700">
          {formatRecordingDuration(durationMs)}
        </span>
      </div>
      <section className="recording-live-volume" aria-label="录音实时音量">
        <div className="recording-live-volume__header">
          <div className="recording-live-volume__label">
            <span className="recording-live-volume__icon" aria-hidden="true">
              {phase === 'recording' ? <Mic2 className="size-5" /> : <Pause className="size-5" />}
            </span>
            <div>
              <strong>{phase === 'recording' ? '正在采集声音' : '录音已暂停'}</strong>
              <span>{phase === 'recording' ? '说话时观察音量条，确认声音持续写入' : '点击“继续”恢复声音采集'}</span>
            </div>
          </div>
          <div className="recording-live-volume__value" aria-live="polite">
            <strong>{Math.round(liveMeterPercent)}%</strong>
            <span>{qualityLabel}</span>
          </div>
        </div>
        <div className="recording-live-meter" aria-label={`实时音量 ${Math.round(liveMeterPercent)}%`}>
          {Array.from({ length: 28 }, (_, index: number) => (
            <i
              className={index < liveMeterBars ? 'is-on' : ''}
              key={index}
              style={{ height: `${8 + ((index * 7) % 16)}px` }}
            />
          ))}
        </div>
        <div className={`recording-live-volume__quality ${qualityColor}`}>
          <span className="size-2 rounded-full bg-current" />
          <span>{qualityDescription}</span>
        </div>
      </section>
      <div className="mt-6 grid gap-3 sm:grid-cols-4">
        <StatusLine
          label="设备"
          value={
            deviceState.state === 'muted'
              ? '已静音'
              : deviceState.state === 'ready'
                ? '已连接'
                : '异常'
          }
        />
        <StatusLine
          label="已写入"
          value={`${chunkCount} 个分片 · ${formatRecordingBytes(recordingBytes)}`}
        />
        <StatusLine
          label="静音时长"
          value={
            metrics.silentForMs > 0
              ? formatRecordingDuration(metrics.silentForMs)
              : '正常'
          }
        />
        <StatusLine
          label="恢复保护"
          value={storageReady ? '已启用' : '已暂停录音'}
        />
      </div>
      {metrics.clipCount > 0 && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          检测到声音过大削波，建议把麦克风移远一些或降低输入音量。
        </div>
      )}
      {deviceState.state === 'muted' && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-900">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          麦克风已被系统静音，录音已暂停；恢复设备后点击“继续”，避免把静音片段写入笔记。
        </div>
      )}
      {deviceState.state === 'ended' && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-xs leading-5 text-red-900">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          麦克风连接已断开，后续不会继续采集；请先完成当前录音并试听确认。
        </div>
      )}
      <div className="recording-action-row mt-7 flex flex-wrap justify-center gap-3">
        <Button className="recording-secondary-button" onClick={onPause} variant="outline" disabled={phase === 'paused'}>
          <Pause />
          暂停
        </Button>
        <Button className="recording-secondary-button" onClick={onResume} variant="outline" disabled={phase === 'recording'}>
          <Play />
          继续
        </Button>
        <Button
          className="bg-blue-600 hover:bg-blue-700"
          disabled={stopping}
          onClick={onStop}
        >
          {stopping ? (
            <LoaderCircle className="animate-spin" />
          ) : (
            <Square className="fill-current" />
          )}
          {stopping ? '正在保存' : '完成录音'}
        </Button>
      </div>
    </div>
  );
}

export function ReviewPanel({
  audioAnalysis,
  canConvert,
  chunkCount,
  durationMs,
  integrityCheck,
  integrityConfirmed,
  integrityChecking,
  onConvert,
  onDownloadBackup,
  onIntegrityConfirm,
  onReset,
  recordingFile,
  recordingUrl,
}: ReviewPanelProps) {
  const [smartPlayback, setSmartPlayback] = useState<boolean>(true);
  const segments = audioAnalysis?.compressibleSegments || [];
  const smartSummary = getSmartPlaybackSummary(durationMs, segments);
  const canUseSmartPlayback: boolean =
    audioAnalysis?.status === 'ready' && segments.length > 0;
  return (
    <div className="recording-review-panel">
      <div className="recording-review-panel__header flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.12em] text-blue-700">
            录音完成
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-[-.04em]">
            先试听，再转成笔记
          </h1>
          <p className="mt-3 text-sm leading-6 text-black/50">
            试听确认声音完整后，才会上传并开始转录。原始录音会保留在转化记录中。
          </p>
        </div>
        <CheckCircle2 className="size-9 text-emerald-600" />
      </div>
      <div className="recording-review-panel__player mt-8 rounded-xl border border-black/8 bg-[#fbfdfc] p-5">
        <RecordingAudioPlayer
          ariaLabel={smartPlayback && canUseSmartPlayback ? '录音智能播放' : '录音完整播放'}
          durationMs={durationMs}
          skipSegments={segments}
          smartPlayback={smartPlayback && canUseSmartPlayback}
          src={recordingUrl}
        />
        <div className="mt-4 grid gap-3 text-xs text-black/55 sm:grid-cols-3">
          <StatusLine
            label="时长"
            value={formatRecordingDuration(durationMs)}
          />
          <StatusLine label="文件" value={formatFileSize(recordingFile.size)} />
          <StatusLine label="数据分片" value={`${chunkCount} 个`} />
        </div>
      </div>
      {audioAnalysis?.status === 'ready' && (
        <div className="mt-4 rounded-lg border border-emerald-100 bg-emerald-50/70 p-4 text-sm leading-6 text-emerald-950">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold">智能播放</p>
              <p className="mt-1 text-xs text-emerald-900/75">
                {canUseSmartPlayback
                  ? `已发现 ${segments.length} 段可安全压缩的安静片段，预计节省 ${formatRecordingDuration(smartSummary.savedDurationMs)}。`
                  : '未发现可安全压缩的长安静片段，完整录音会保持不变。'}
              </p>
            </div>
            {canUseSmartPlayback && (
              <Button
                className="border-emerald-200 bg-white text-emerald-800 hover:bg-emerald-100"
                onClick={() => setSmartPlayback((enabled: boolean) => !enabled)}
                size="sm"
                type="button"
                variant="outline"
              >
                {smartPlayback ? '切换完整播放' : '启用智能播放'}
              </Button>
            )}
          </div>
          {canUseSmartPlayback && (
            <p className="mt-3 text-xs text-emerald-900/75">
              {smartPlayback
                ? `当前为智能播放，原始时长 ${formatRecordingDuration(durationMs)}，预计回听 ${formatRecordingDuration(smartSummary.smartDurationMs)}。`
                : '当前为完整播放，所有安静片段均会保留。'}
            </p>
          )}
          {audioAnalysis.hasMonitoringGaps && (
            <p className="mt-3 text-xs text-amber-800">
              录音监测曾短暂中断；系统仅处理连续低活动片段，其余内容已完整保留。
            </p>
          )}
        </div>
      )}
      {audioAnalysis?.status === 'unavailable' && (
        <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 text-xs leading-5 text-slate-700">
          本次未生成智能播放建议，完整录音仍可正常试听和转为笔记。
        </p>
      )}
      <div className="recording-review-panel__notice mt-6 rounded-lg border border-blue-100 bg-blue-50/70 p-4 text-sm leading-6 text-blue-950">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-blue-700" />
          <span>试听完成且确认没有断音、明显杂音或漏录，再开始转化。</span>
        </div>
      </div>
      {integrityCheck && (
        <div
          className={`mt-4 rounded-lg border p-4 text-sm leading-6 ${
            integrityCheck.status === 'passed'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
              : integrityCheck.status === 'review'
                ? 'border-amber-200 bg-amber-50 text-amber-900'
                : 'border-red-200 bg-red-50 text-red-900'
          }`}
        >
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 size-5 shrink-0" />
            <div>
              <p className="font-semibold">
                {integrityCheck.status === 'passed'
                  ? '录音完整性检查通过'
                  : integrityCheck.status === 'review'
                    ? '需要你确认录音完整性'
                    : '录音完整性检查未通过'}
              </p>
              <p className="mt-1">{integrityCheck.message}</p>
              {integrityCheck.status === 'review' && (
                <label className="mt-3 flex items-start gap-2 font-medium">
                  <Checkbox
                    checked={integrityConfirmed}
                    onCheckedChange={(checked: boolean | 'indeterminate') =>
                      onIntegrityConfirm(checked === true)
                    }
                  />
                  <span>我已试听并确认录音没有断音、漏录或明显杂音</span>
                </label>
              )}
            </div>
          </div>
        </div>
      )}
      {integrityChecking && (
        <div className="mt-4 flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
          <LoaderCircle className="size-5 animate-spin" />
          正在验证录音文件是否可播放、时长是否完整…
        </div>
      )}
      <div className="recording-review-panel__actions mt-7 flex flex-wrap gap-3">
        <Button
          className="bg-blue-600 hover:bg-blue-700"
          disabled={!canConvert}
          onClick={onConvert}
        >
          <UploadCloud />
          转为笔记
        </Button>
        <Button className="recording-secondary-button" onClick={onDownloadBackup} variant="outline">
          <FileAudio />
          下载录音备份
        </Button>
        <Button className="recording-secondary-button" onClick={onReset} variant="outline">
          <RefreshCcw />
          重新录音
        </Button>
      </div>
    </div>
  );
}

export function ProcessingPanel({
  error,
  job,
  onCancel,
  onReset,
  progress,
  uploading,
}: ProcessingPanelProps) {
  const stageIndex: number = getRecordingProcessStageIndex(job?.stage);
  const completed: boolean = job?.stage === 'completed';
  const transcriptionLabel: string = getTranscriptionProviderLabel(
    job?.transcriptionProvider,
    job?.transcriptionModel,
    job?.transcriptionProviderName,
  );
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[.12em] text-blue-700">
        {completed ? '处理完成' : '正在生成笔记'}
      </p>
      <h1 className="mt-3 text-3xl font-bold tracking-[-.04em]">
        {completed ? '笔记已经准备好' : '录音正在变成结构化笔记'}
      </h1>
      <p className="mt-3 text-sm leading-6 text-black/50">
        {uploading
          ? '正在安全上传录音文件…'
          : job?.message || '任务已提交，正在处理…'}
      </p>
      {job?.transcriptionNotice && (
        <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-950">
          {job.transcriptionNotice}
        </p>
      )}
      {job && (
        <p className="mt-4 flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50/70 p-3 text-xs text-blue-950">
          <Mic2 className="size-4 shrink-0 text-blue-700" />
          <span>
            本次转录模型：<strong>{transcriptionLabel}</strong>
          </span>
        </p>
      )}
      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        {RECORDING_PROCESS_STAGES.map(([stage, label], index: number) => (
          <div
            className={`rounded-lg border p-3 text-xs ${
              index < stageIndex
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : index === stageIndex
                  ? 'border-blue-200 bg-blue-50 text-blue-800'
                  : 'border-black/8 bg-[#fbfcff] text-black/35'
            }`}
            key={stage}
          >
            <span className="flex items-center gap-2 font-semibold">
              {index < stageIndex ? (
                <CheckCircle2 className="size-4" />
              ) : (
                <span className="size-4 rounded-full border border-current" />
              )}
              {label}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-8 flex items-center justify-between text-sm">
        <span className="font-semibold">
          {uploading ? '安全上传' : job?.stage || '排队中'}
        </span>
        <span className="tabular-nums text-black/45">{progress}%</span>
      </div>
      <Progress
        className="mt-3 h-2 bg-black/6 [&>div]:bg-blue-600"
        value={progress}
      />
      {error && (
        <p className="mt-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {error}
        </p>
      )}
      {completed && job?.documentUrl && (
        <Button
          className="mt-7 w-full bg-blue-600 hover:bg-blue-700"
          onClick={() =>
            window.open(job.documentUrl, '_blank', 'noopener,noreferrer')
          }
        >
          打开总结笔记
          <ArrowUpRight />
        </Button>
      )}
      {completed && job?.rawDocumentUrl && (
        <Button
          className="mt-3 w-full"
          onClick={() =>
            window.open(job.rawDocumentUrl, '_blank', 'noopener,noreferrer')
          }
          variant="outline"
        >
          查看原始转录
          <ArrowUpRight />
        </Button>
      )}
      {!completed && (
        <Button className="mt-7 w-full" onClick={onCancel} variant="outline">
          <Square className="fill-current" />
          停止处理
        </Button>
      )}
      {completed && (
        <Button className="mt-3 w-full" onClick={onReset} variant="outline">
          再录一段
        </Button>
      )}
    </div>
  );
}

export function ReliabilityItem({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-lg border border-black/8 bg-[#fbfcff] p-3">
      <span className="flex items-center gap-2 text-xs font-semibold text-blue-700">
        {icon}
        {label}
      </span>
      <span className="mt-2 block text-xs text-black/50">{value}</span>
    </div>
  );
}

export function StatusLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-black/6 pb-2 text-xs last:border-0 last:pb-0">
      <span className="text-black/45">{label}</span>
      <strong className="text-right font-semibold text-black/70">{value}</strong>
    </div>
  );
}
