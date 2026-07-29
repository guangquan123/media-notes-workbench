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

function createTextStream(
  text: string,
): AsyncIterable<Record<string, unknown>> {
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
  it('does not rewrite a complete note after the quality gate passes', async () => {
    const completeNote: string = `# 完整培训笔记

## 一、内容概览
本次培训介绍平台背景。[S01]

## 二、核心结论与关键要点
平台需要保留完整事实依据。[S01]

## 三、核心知识体系
> 转写原话：“完整事实依据不能丢失。” [S01]

## 四、一页复习
必须记住完整性优先。`;
    const modelResponses: string[] = [
      '[S01][事实] 完整事实依据不能丢失。',
      completeNote,
    ];
    const callStream = jest.fn(
      async (): Promise<AsyncIterable<Record<string, unknown>>> =>
        createTextStream(modelResponses.shift() || completeNote),
    );
    const capabilityService = {
      load: (): { callStream: typeof callStream } => ({ callStream }),
    } as unknown as CapabilityService;
    const externalModelSettingsService = {
      getCredentials: async (): Promise<undefined> => undefined,
    } as unknown as ExternalModelSettingsService;
    const service: NoteSummaryPipelineService = new NoteSummaryPipelineService(
      capabilityService,
      externalModelSettingsService,
    );

    const result = await service.generate({
      noteStyle: 'learning',
      onProgress: (): void => undefined,
      sourceText: '完整事实依据不能丢失。',
      sourceTitle: '完整培训',
      styleRequirements: '输出详细笔记。',
    });

    expect(result.markdown).toBe(completeNote);
    expect(result.quality.passed).toBe(true);
    expect(callStream).toHaveBeenCalledTimes(2);
  });

  it('keeps the original long ledger when model compaction loses evidence', async () => {
    const sourceText: string = '原文'.repeat(24_000);
    const detailedBody: string = Array.from(
      { length: 240 },
      (_: unknown, index: number): string =>
        `- 详细事实 ${index + 1}：${'保留完整上下文。'.repeat(12)}`,
    ).join('\n');
    const completeNote: string = `# 长培训笔记

## 一、内容概览
覆盖全部来源。[S01][S02][S03][S04]

## 二、核心结论与关键要点
长材料需要完整保留证据来源。

## 三、核心知识体系
> 转写原话：“保留完整上下文。” [S01]
${detailedBody}

## 四、一页复习
必须记住信息保真优先。`;
    let extractionIndex = 0;
    const callStream = jest.fn(
      async (
        _actionKey: string,
        input: Record<string, unknown>,
      ): Promise<AsyncIterable<Record<string, unknown>>> => {
        const instruction: string = String(input.task_instruction || '');
        if (instruction.includes('高精度内容提取员')) {
          extractionIndex += 1;
          const sourceId: string = `S${String(extractionIndex).padStart(2, '0')}`;
          return createTextStream(
            `[${sourceId}][事实] ${'完整证据内容。'.repeat(1_800)}`,
          );
        }
        if (instruction.includes('证据账本合并员')) {
          return createTextStream('[S01][事实] 压缩后只剩第一块。');
        }
        return createTextStream(completeNote);
      },
    );
    const capabilityService = {
      load: (): { callStream: typeof callStream } => ({ callStream }),
    } as unknown as CapabilityService;
    const externalModelSettingsService = {
      getCredentials: async (): Promise<undefined> => undefined,
    } as unknown as ExternalModelSettingsService;
    const service: NoteSummaryPipelineService = new NoteSummaryPipelineService(
      capabilityService,
      externalModelSettingsService,
    );

    const result = await service.generate({
      noteStyle: 'learning',
      onProgress: (): void => undefined,
      sourceText,
      sourceTitle: '长培训',
      styleRequirements: '输出详细笔记。',
    });

    expect(result.evidenceLedger.length).toBeGreaterThan(45_000);
    expect(result.evidenceLedger).toContain('[S04][事实]');
    expect(result.markdown).toBe(completeNote);
  });

  it('returns the best repaired note with warnings when quality remains low', async () => {
    const incompleteNote: string = '# 不完整笔记\n\n只有一段简短内容。';
    const modelResponses: string[] = [
      '[S01][事实] 示例培训材料。',
      incompleteNote,
      incompleteNote,
      incompleteNote,
    ];
    const callStream = jest.fn(
      async (): Promise<AsyncIterable<Record<string, unknown>>> =>
        createTextStream(modelResponses.shift() || incompleteNote),
    );
    const capabilityService = {
      load: (): { callStream: typeof callStream } => ({ callStream }),
    } as unknown as CapabilityService;
    const externalModelSettingsService = {
      getCredentials: async (): Promise<undefined> => undefined,
    } as unknown as ExternalModelSettingsService;
    const service: NoteSummaryPipelineService = new NoteSummaryPipelineService(
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
