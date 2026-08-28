import {
  getRecordingProcessStageIndex,
  getTranscriptionProviderLabel,
  RECORDING_PROCESS_STAGES,
} from '../../client/src/pages/RecordingNotesPage/recording-processing.utils';

describe('recording processing stage progress', () => {
  it('marks every visible node as done when the job is completed', () => {
    const completedIndex: number = getRecordingProcessStageIndex('completed');
    const allStagesDone: boolean = RECORDING_PROCESS_STAGES.every(
      (_stage: readonly [string, string], index: number) =>
        index < completedIndex,
    );

    expect(completedIndex).toBe(RECORDING_PROCESS_STAGES.length);
    expect(allStagesDone).toBe(true);
  });

  it('keeps transcribing as the active node while transcription is running', () => {
    expect(getRecordingProcessStageIndex('transcribing')).toBe(3);
  });

  it('shows only the actual provider returned by the running task', () => {
    expect(getTranscriptionProviderLabel()).toBe('等待任务返回实际引擎');
    expect(getTranscriptionProviderLabel('local_whisper')).toBe('本地 Whisper');
    expect(getTranscriptionProviderLabel('tencent_asr')).toBe('腾讯云 ASR 大模型');
  });
});
