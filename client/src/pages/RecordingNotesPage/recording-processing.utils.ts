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
