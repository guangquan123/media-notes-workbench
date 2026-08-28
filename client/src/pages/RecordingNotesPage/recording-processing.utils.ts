export const RECORDING_PROCESS_STAGES: ReadonlyArray<
  readonly [string, string]
> = [
  ['uploading', '安全上传'],
  ['checking', '检查处理环境'],
  ['preparing', '整理录音'],
  ['transcribing', '语音转文字'],
  ['summarizing', '生成笔记'],
  ['publishing', '写入飞书'],
];

export function getRecordingProcessStageIndex(stage?: string): number {
  if (stage === 'completed') return RECORDING_PROCESS_STAGES.length;
  const index: number = RECORDING_PROCESS_STAGES.findIndex(
    ([stageName]: readonly [string, string]) => stageName === stage,
  );
  return index >= 0 ? index : 0;
}

export function getTranscriptionProviderLabel(
  provider?: 'tencent_asr' | 'local_whisper' | 'mixed',
): string {
  if (provider === 'tencent_asr') return '腾讯云 ASR 大模型';
  if (provider === 'local_whisper') return '本地 Whisper';
  if (provider === 'mixed') return '腾讯云 ASR + 本地 Whisper';
  return '等待任务返回实际引擎';
}
