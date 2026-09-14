import {
  appendStoredRecordingChunk,
  checkRecordingStorage,
  deleteStoredRecording,
  finishStoredRecording,
  loadLatestStoredRecording,
  startStoredRecording,
} from '../../client/src/pages/RecordingNotesPage/recording-storage';

describe('recording storage fallback', () => {
  it('keeps recording chunks in memory when IndexedDB is unavailable', async () => {
    const sessionId = `memory-${Date.now()}`;

    await expect(checkRecordingStorage()).resolves.toBeUndefined();
    await startStoredRecording({
      captureMode: 'microphone',
      id: sessionId,
      mimeType: 'audio/webm',
      title: '内存录音',
    });
    await appendStoredRecordingChunk({
      blob: new Blob(['audio'], { type: 'audio/webm' }),
      durationMs: 1_000,
      index: 0,
      sessionId,
    });
    await finishStoredRecording(sessionId, 1_000);

    const recording = await loadLatestStoredRecording();
    expect(recording).toMatchObject({
      captureMode: 'microphone',
      chunkCount: 1,
      durationMs: 1_000,
      interrupted: false,
      sessionId,
      title: '内存录音',
    });
    expect(await recording?.blob.text()).toBe('audio');

    await deleteStoredRecording(sessionId);
    await expect(loadLatestStoredRecording()).resolves.toBeNull();
  });

  it('uses session memory when IndexedDB is exposed but refuses to open', async () => {
    const windowDescriptor: PropertyDescriptor | undefined =
      Object.getOwnPropertyDescriptor(globalThis, 'window');
    let openAttempts = 0;
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        indexedDB: {
          open: (): never => {
            openAttempts += 1;
            throw new Error('IndexedDB is blocked');
          },
        },
      },
      writable: true,
    });

    const sessionId = `blocked-${Date.now()}`;
    try {
      await expect(checkRecordingStorage()).resolves.toBeUndefined();
      await startStoredRecording({
        captureMode: 'microphone',
        id: sessionId,
        mimeType: 'audio/webm',
        title: '受限浏览器录音',
      });
      await appendStoredRecordingChunk({
        blob: new Blob(['audio'], { type: 'audio/webm' }),
        durationMs: 1_000,
        index: 0,
        sessionId,
      });
      await finishStoredRecording(sessionId, 1_000);

      const recording = await loadLatestStoredRecording();
      expect(openAttempts).toBe(1);
      expect(recording?.sessionId).toBe(sessionId);
      expect(await recording?.blob.text()).toBe('audio');
    } finally {
      await deleteStoredRecording(sessionId);
      if (windowDescriptor) {
        Object.defineProperty(globalThis, 'window', windowDescriptor);
      } else {
        Reflect.deleteProperty(globalThis, 'window');
      }
    }
  });
});
