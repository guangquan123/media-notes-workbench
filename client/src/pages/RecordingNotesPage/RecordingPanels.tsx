import type { ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  FileAudio,
  LoaderCircle,
  Mic2,
  Pause,
  Play,
  RefreshCcw,
  ShieldCheck,
  Square,
  UploadCloud,
  Volume2,
} from 'lucide-react';

import NoteStyleSelector from '@/components/NoteStyleSelector';
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
import type { NoteJob, NoteStyle } from '@shared/api.interface';
import type { TranscriptionLanguageMode } from '@shared/api.interface';
import {
  type RecordingAudioProfile,
  formatRecordingBytes,
  formatRecordingDuration,
  type RecordingIntegrityCheck,
} from './recording-note.utils';
import {
  getRecordingProcessStageIndex,
  RECORDING_PROCESS_STAGES,
} from './recording-processing.utils';
import type { RecoverableRecording } from './recording-storage';
import type { RecorderDeviceState, RecorderMetrics } from './reliable-recorder';

type ActiveRecordingPhase = 'recording' | 'paused';

interface SetupPanelProps {
  audioProfile: RecordingAudioProfile;
  canStart: boolean;
  hotwords: string;
  languageMode: TranscriptionLanguageMode;
  noteStyle: NoteStyle;
  onDiscardRecovery: () => void;
  onAudioProfileChange: (value: RecordingAudioProfile) => void;
  onHotwordsChange: (value: string) => void;
  onLanguageModeChange: (value: TranscriptionLanguageMode) => void;
  onNoteStyleChange: (value: NoteStyle) => void;
  onPrepare: () => void;
  onRecover: () => void;
  onStart: () => void;
  onTitleChange: (value: string) => void;
  preparing: boolean;
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

export function SetupPanel({
  audioProfile,
  canStart,
  hotwords,
  languageMode,
  noteStyle,
  onDiscardRecovery,
  onAudioProfileChange,
  onHotwordsChange,
  onLanguageModeChange,
  onNoteStyleChange,
  onPrepare,
  onRecover,
  onStart,
  onTitleChange,
  preparing,
  recoverable,
  storageReady,
  title,
}: SetupPanelProps) {
  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.12em] text-blue-700">
            独立录音入口
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-[-.04em] md:text-4xl">
            直接录音，自动整理成笔记
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-black/50">
            开始前先做麦克风声音测试；录音过程中持续检测音量、设备连接和数据写入，结束后先试听，再提交转录。
          </p>
        </div>
        <span className="grid size-11 shrink-0 place-items-center rounded-lg bg-blue-600 text-white shadow-lg shadow-blue-600/20">
          <FileAudio className="size-5" />
        </span>
      </div>
      <label className="mt-8 block text-xs font-semibold text-black/60">
        录音标题
        <Input
          className="mt-2 h-11 border-black/10 bg-[#fbfcff]"
          onChange={(event) => onTitleChange(event.target.value)}
          value={title}
        />
      </label>
      <div className="mt-6">
        <NoteStyleSelector value={noteStyle} onChange={onNoteStyleChange} />
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <div className="grid gap-2 text-xs font-semibold text-black/60">
          录音模式
          <Select
            onValueChange={(value: string) =>
              onAudioProfileChange(value as RecordingAudioProfile)
            }
            value={audioProfile}
          >
            <SelectTrigger className="h-11 w-full border-black/10 bg-[#fbfcff] font-normal text-black/75">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="fidelity">原声保真（方言/安静环境）</SelectItem>
              <SelectItem value="clarity">会议清晰（回声/多人环境）</SelectItem>
              <SelectItem value="noisy">强噪增强（风扇/街道）</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2 text-xs font-semibold text-black/60">
          语言模式
          <Select
            onValueChange={(value: string) =>
              onLanguageModeChange(value as TranscriptionLanguageMode)
            }
            value={languageMode}
          >
            <SelectTrigger className="h-11 w-full border-black/10 bg-[#fbfcff] font-normal text-black/75">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">自动识别（推荐）</SelectItem>
              <SelectItem value="mandarin">普通话</SelectItem>
              <SelectItem value="sichuan">四川话增强</SelectItem>
              <SelectItem value="cantonese">粤语</SelectItem>
              <SelectItem value="mixed">普通话 + 英语/方言混说</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <label className="mt-4 grid gap-2 text-xs font-semibold text-black/60">
        本次词表（可选）
        <Input className="h-11 border-black/10 bg-[#fbfcff] text-sm font-normal" value={hotwords} onChange={(event) => onHotwordsChange(event.target.value)} placeholder="人名、项目名、术语，用逗号分隔" />
        <span className="font-normal text-black/40">词表只作为识别提示，不会覆盖原始转写。</span>
      </label>
      <div className="mt-7 grid gap-3 sm:grid-cols-3">
        <ReliabilityItem
          icon={<ShieldCheck className="size-4" />}
          label="开始前检查"
          value="权限、设备、声音"
        />
        <ReliabilityItem
          icon={<Volume2 className="size-4" />}
          label="录音中监控"
          value="音量、静音、削波"
        />
        <ReliabilityItem
          icon={<RefreshCcw className="size-4" />}
          label="意外可恢复"
          value="每秒保存分片"
        />
      </div>
      <div className="mt-7 rounded-lg border border-blue-100 bg-blue-50/70 p-4 text-sm text-blue-950">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-blue-700" />
          <p className="leading-6">
            只有点击“开始录音”后才会持续采集。录音完成前不会提交转录，试听确认后才上传处理。
          </p>
        </div>
      </div>
      <div
        className={`mt-4 rounded-lg border p-4 text-sm leading-6 ${
          storageReady
            ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
            : 'border-red-200 bg-red-50 text-red-900'
        }`}
      >
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 size-5 shrink-0" />
          <p>
            {storageReady
              ? '录音保护已就绪：每秒写入本地恢复存储，页面意外刷新后可以找回。'
              : '录音保护存储不可用，暂不允许开始录音，以免页面意外关闭后丢失内容。'}
          </p>
        </div>
      </div>
      {recoverable && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <span>
            发现上次未完成的录音（
            {formatRecordingDuration(recoverable.durationMs)}）
          </span>
          <span className="flex gap-2">
            <Button onClick={onRecover} size="sm">
              恢复录音
            </Button>
            <Button onClick={onDiscardRecovery} size="sm" variant="outline">
              丢弃
            </Button>
          </span>
        </div>
      )}
      <div className="mt-8 flex flex-wrap gap-3">
        <Button
          className="min-h-11 bg-blue-600 px-5 hover:bg-blue-700"
          disabled={preparing}
          onClick={onPrepare}
        >
          {preparing ? (
            <LoaderCircle className="animate-spin" />
          ) : (
            <Mic2 />
          )}
          {preparing ? '正在检测麦克风' : '检测麦克风'}
        </Button>
        <Button
          className="min-h-11 px-5"
          disabled={!canStart}
          onClick={onStart}
          variant="outline"
        >
          <Play />
          开始录音
        </Button>
      </div>
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
  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.12em] text-blue-700">
            {phase === 'recording' ? '正在录音' : '录音已暂停'}
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-[-.04em]">
            {title || '未命名录音'}
          </h1>
        </div>
        <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700">
          {formatRecordingDuration(durationMs)}
        </span>
      </div>
      <div className="mt-10 grid place-items-center rounded-xl bg-[#f7faff] py-10">
        <div className="grid size-36 place-items-center rounded-full border border-blue-200 bg-blue-50 shadow-[0_0_0_16px_rgba(37,99,235,.05)]">
          <span className="grid size-16 place-items-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-600/25">
            {phase === 'recording' ? (
              <Mic2 className="size-7" />
            ) : (
              <Pause className="size-7" />
            )}
          </span>
        </div>
        <div className="mt-7 text-5xl font-bold tabular-nums tracking-[-.06em]">
          {formatRecordingDuration(durationMs)}
        </div>
        <div
          className={`mt-3 flex items-center gap-2 text-sm font-semibold ${qualityColor}`}
        >
          <span className="size-2 rounded-full bg-current" />
          {qualityLabel} · {qualityDescription}
        </div>
        <div className="mt-6 h-2 w-[min(100%,420px)] overflow-hidden rounded-full bg-blue-100">
          <span
            className="block h-full rounded-full bg-blue-600 transition-[width]"
            style={{ width: `${signalWidth}%` }}
          />
        </div>
        <div className="mt-3 text-xs text-black/45">
          实时输入电平 · {Math.round(metrics.rms * 1_000) / 10}%
        </div>
      </div>
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
      <div className="mt-7 flex flex-wrap justify-center gap-3">
        <Button onClick={onPause} variant="outline" disabled={phase === 'paused'}>
          <Pause />
          暂停
        </Button>
        <Button onClick={onResume} variant="outline" disabled={phase === 'recording'}>
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
  return (
    <div>
      <div className="flex items-start justify-between gap-4">
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
      <div className="mt-8 rounded-xl border border-black/8 bg-[#fbfdfc] p-5">
        <audio
          aria-label="录音试听"
          className="w-full"
          controls
          preload="metadata"
          src={recordingUrl || undefined}
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
      <div className="mt-6 rounded-lg border border-blue-100 bg-blue-50/70 p-4 text-sm leading-6 text-blue-950">
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
      <div className="mt-7 flex flex-wrap gap-3">
        <Button
          className="bg-blue-600 hover:bg-blue-700"
          disabled={!canConvert}
          onClick={onConvert}
        >
          <UploadCloud />
          转为笔记
        </Button>
        <Button onClick={onDownloadBackup} variant="outline">
          <FileAudio />
          下载录音备份
        </Button>
        <Button onClick={onReset} variant="outline">
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
