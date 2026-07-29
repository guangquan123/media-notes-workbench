import type { CapabilityService } from '@lark-apaas/fullstack-nestjs-core';
import type { ExternalModelSettingsService } from '../../server/modules/note-jobs/external-model-settings.service';
import { NoteSummaryPipelineService } from '../../server/modules/note-jobs/note-summary-pipeline.service';

jest.mock(
  '@shared/async.utils',
  () => ({
    mapWithConcurrency: async (
      items: unknown[],
      _limit: number,
      mapper: (item: unknown, index: number) => Promise<unknown>,
    ): Promise<unknown[]> => Promise.all(items.map(mapper)),
  }),
  { virtual: true },
);

function createTextStream(text: string): AsyncIterable<Record<string, unknown>> {
  return {
    async *[Symbol.asyncIterator](): AsyncIterator<
      Record<string, unknown>,
      void
    > {
      yield { content: text };
    },
  };
}

describe('NoteSummaryPipelineService', () => {
  it('returns the best repaired note with warnings when quality remains low', async () => {
    const incompleteNote: string = '# 不完整笔记\n\n只有一段简短内容。';
    const modelResponses: string[] = [
      '[S01][事实] 示例培训材料。',
      incompleteNote,
      incompleteNote,
      incompleteNote,
    ];
    const callStream = jest.fn(async (): Promise<
      AsyncIterable<Record<string, unknown>>
    > => createTextStream(modelResponses.shift() || incompleteNote));
    const capabilityService = {
      load: (): { callStream: typeof callStream } => ({ callStream }),
    } as unknown as CapabilityService;
    const externalModelSettingsService = {
      getCredentials: async (): Promise<undefined> => undefined,
    } as unknown as ExternalModelSettingsService;
    const service: NoteSummaryPipelineService =
      new NoteSummaryPipelineService(
        capabilityService,
        externalModelSettingsService,
      );

    const result = await service.generate({
      noteStyle: 'learning',
      onProgress: (): void => undefined,
      sourceText: '示例培训材料。',
      sourceTitle: '示例培训',
      styleRequirements: '保持学习笔记结构。',
    });

    expect(result.markdown).toBe(incompleteNote);
    expect(result.quality.passed).toBe(false);
    expect(result.quality.failedChecks.length).toBeGreaterThan(0);
    expect(callStream).toHaveBeenCalledTimes(4);
  });
});
