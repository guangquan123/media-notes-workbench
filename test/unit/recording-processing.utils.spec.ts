import {
  getRecordingProcessStageIndex,
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
});
