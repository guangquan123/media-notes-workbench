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
  it('retries a reasoning-only completion with a larger output budget', async () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockImplementation(
        async (
          _input: RequestInfo | URL,
          init?: RequestInit,
        ): Promise<Response> => {
          const body = JSON.parse(String(init?.body)) as {
            max_tokens?: number;
          };
          if (body.max_tokens === 64) {
            return {
              json: async (): Promise<unknown> => ({
                choices: [
                  {
                    finish_reason: 'length',
                    message: {
                      content: '',
                      reasoning_content: '需要更多输出预算才能完成结构化笔记。',
                      role: 'assistant',
                    },
                  },
                ],
              }),
              ok: true,
              status: 200,
            } as Response;
          }
          return {
            json: async (): Promise<unknown> => ({
              choices: [{ message: { content: '结构化笔记正文' } }],
            }),
            ok: true,
            status: 200,
          } as Response;
        },
      );
    try {
      const service = new NoteSummaryPipelineService(
        { load: jest.fn() } as unknown as CapabilityService,
        {
          getCredentials: async () => ({
            apiKey: 'test-key',
            baseUrl: 'https://model.example.com/v1',
            enabled: true,
            model: 'test-model',
          }),
        } as unknown as ExternalModelSettingsService,
      );
      const generateModelText = (
        service as unknown as {
          generateModelText: (
            instruction: string,
            maxTokens: number,
            pluginInstanceId: string,
          ) => Promise<{ text: string }>;
        }
      ).generateModelText.bind(service);

      await expect(
        generateModelText('生成笔记', 64, 'writer'),
      ).resolves.toEqual(expect.objectContaining({ text: '结构化笔记正文' }));
      expect(fetchSpy).toHaveBeenCalledTimes(2);
      const retryBody = JSON.parse(
        String(fetchSpy.mock.calls[1]?.[1]?.body),
      ) as { max_tokens?: number };
      expect(retryBody.max_tokens).toBe(32_768);
      const firstSignal = fetchSpy.mock.calls[0]?.[1]?.signal;
      const retrySignal = fetchSpy.mock.calls[1]?.[1]?.signal;
      expect(firstSignal).toBeDefined();
      expect(retrySignal).toBeDefined();
      expect(retrySignal).not.toBe(firstSignal);
    } finally {
      fetchSpy.mockRestore();
    }
  });
  it('keeps the missing-config guidance in local mode when credentials are absent', async () => {
    const capabilityService = {
      load: jest.fn(),
    } as unknown as CapabilityService;
    const externalModelSettingsService = {
      getCredentials: async (): Promise<undefined> => undefined,
    } as unknown as ExternalModelSettingsService;
    const runtimeRegistryService = {
      isLocal: async (): Promise<boolean> => true,
    };
    const service: NoteSummaryPipelineService = new NoteSummaryPipelineService(
      capabilityService,
      externalModelSettingsService,
      runtimeRegistryService as never,
    );
    const generateModelText = (
      service as unknown as {
        generateModelText: (
          instruction: string,
          maxTokens: number,
          pluginInstanceId: string,
        ) => Promise<unknown>;
      }
    ).generateModelText.bind(service);

    await expect(generateModelText('生成笔记', 64, 'writer')).rejects.toThrow(
      '本地模式未配置或未启用外部 AI 模型',
    );
  });

  it('reports the real external-model failure in local mode instead of claiming it is unconfigured', async () => {
    const capabilityService = {
      load: jest.fn(),
    } as unknown as CapabilityService;
    const externalModelSettingsService = {
      getCredentials: async () => ({
        apiKey: 'test-key',
        baseUrl: 'https://model.example.com/v1',
        enabled: true,
        model: 'test-model',
      }),
    } as unknown as ExternalModelSettingsService;
    const runtimeRegistryService = {
      isLocal: async (): Promise<boolean> => true,
    };
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockRejectedValue(new Error('connect ECONNREFUSED'));
    const service: NoteSummaryPipelineService = new NoteSummaryPipelineService(
      capabilityService,
      externalModelSettingsService,
      runtimeRegistryService as never,
    );
    const generateModelText = (
      service as unknown as {
        generateModelText: (
          instruction: string,
          maxTokens: number,
          pluginInstanceId: string,
        ) => Promise<unknown>;
      }
    ).generateModelText.bind(service);

    await expect(generateModelText('生成笔记', 64, 'writer')).rejects.toThrow(
      '本地模式的外部 AI 模型调用失败（test-model）：connect ECONNREFUSED',
    );
    fetchSpy.mockRestore();
  });
  it('normalizes an aborted external-model request in local mode', async () => {
    const capabilityService = {
      load: jest.fn(),
    } as unknown as CapabilityService;
    const externalModelSettingsService = {
      getCredentials: async () => ({
        apiKey: 'test-key',
        baseUrl: 'https://model.example.com/v1',
        enabled: true,
        model: 'test-model',
      }),
    } as unknown as ExternalModelSettingsService;
    const runtimeRegistryService = {
      isLocal: async (): Promise<boolean> => true,
    };
    const fetchSpy = jest.spyOn(global, 'fetch').mockRejectedValue(
      Object.assign(new Error('This operation was aborted'), {
        name: 'AbortError',
      }),
    );
    const service: NoteSummaryPipelineService = new NoteSummaryPipelineService(
      capabilityService,
      externalModelSettingsService,
      runtimeRegistryService as never,
    );
    const generateModelText = (
      service as unknown as {
        generateModelText: (
          instruction: string,
          maxTokens: number,
          pluginInstanceId: string,
        ) => Promise<unknown>;
      }
    ).generateModelText.bind(service);

    try {
      await generateModelText('生成笔记', 64, 'writer');
      throw new Error('expected generateModelText to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      const message = (error as Error).message;
      expect(message).toContain('外部模型请求超时或被中止');
      expect(message).toContain('单次请求上限 15 分钟');
      expect(message).not.toContain('This operation was aborted');
    } finally {
      fetchSpy.mockRestore();
    }
  });
  it('writes every structured evidence item in one pass when quality passes', async () => {
    const completeNote: string = `# 完整培训笔记

## 一、内容概览
本次培训介绍平台背景。[E-S01-001]

## 二、核心结论与关键要点
平台需要保留完整事实依据。[E-S01-001]

## 三、核心知识体系
> 转写原话：“完整事实依据不能丢失。” [E-S01-001]

完整事实依据需要在内容概览、核心结论和详细正文中保持一致，并在对应句段后标注来源，避免后续复习时无法回到原始依据。对于同一事实，可以调整组织方式，但不能删除原句表达中的限制条件，也不能把尚未确认的信息改写为确定结论。[E-S01-001]

## 四、风险、误区与注意事项
完整事实依据不能丢失，否则结论不可追溯。[E-S01-001]

## 五、一页复习
必须记住完整性优先。`;
    const callStream = jest.fn(
      async (
        _actionKey: string,
        input: Record<string, unknown>,
      ): Promise<AsyncIterable<Record<string, unknown>>> => {
        expect(String(input.task_instruction || '')).toContain(
          '高级中文知识管理编辑',
        );
        return createTextStream(completeNote);
      },
    );
    const load = jest.fn(
      (_instanceId: string): { callStream: typeof callStream } => ({
        callStream,
      }),
    );
    const capabilityService = { load } as unknown as CapabilityService;
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

    expect(result.markdown).toContain('[S01]');
    expect(result.markdown).not.toContain('E-S01-001');
    expect(result.quality.passed).toBe(true);
    expect(callStream).toHaveBeenCalledTimes(1);
    expect(
      load.mock.calls.map((call: string[]): string => call[0] || ''),
    ).toEqual(['note-summary-pipeline-writer']);
  });

  it('retries a transient builtin-model timeout and completes the pipeline', async () => {
    jest.useFakeTimers();
    const completeNote: string = `# 完整培训笔记

## 一、内容概览
完整事实依据不能丢失。[E-S01-001]

## 二、核心结论与关键要点
完整事实依据不能丢失。[E-S01-001]

## 三、核心知识体系
> 转写原话：“完整事实依据不能丢失。” [E-S01-001]

完整事实依据需要在内容概览、核心结论和详细正文中保持一致，并在对应句段后标注来源，避免后续复习时无法回到原始依据。对于同一事实，可以调整组织方式，但不能删除原句表达中的限制条件，也不能把尚未确认的信息改写为确定结论。[E-S01-001]

## 四、风险、误区与注意事项
完整事实依据不能丢失，否则结论不可追溯。[E-S01-001]

## 五、一页复习
完整事实依据不能丢失。`;
    let writerAttempts: number = 0;
    const callStream = jest.fn(
      async (
        _actionKey: string,
        input: Record<string, unknown>,
      ): Promise<AsyncIterable<Record<string, unknown>>> => {
        const instruction: string = String(input.task_instruction || '');
        if (instruction.includes('高级中文知识管理编辑')) {
          writerAttempts += 1;
          if (writerAttempts === 1) throw new Error('llm rpc timeout');
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

    try {
      const resultPromise = service.generate({
        noteStyle: 'learning',
        onProgress: (): void => undefined,
        sourceText: '完整事实依据不能丢失。',
        sourceTitle: '完整培训',
        styleRequirements: '输出详细笔记。',
      });
      await jest.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.quality.passed).toBe(true);
      expect(writerAttempts).toBe(2);
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not retry a non-transient builtin-model failure', async () => {
    const callStream = jest.fn(async (): Promise<never> => {
      throw new Error('input schema invalid');
    });
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

    await expect(
      service.generate({
        noteStyle: 'learning',
        onProgress: (): void => undefined,
        sourceText: '完整事实依据不能丢失。',
        sourceTitle: '完整培训',
        styleRequirements: '输出详细笔记。',
      }),
    ).rejects.toThrow('input schema invalid');
    expect(callStream).toHaveBeenCalledTimes(1);
  });

  it('adds deterministic source facts omitted by model extraction', async () => {
    const completeNote: string = `# 智能体培训笔记

## 一、内容概览
培训介绍提示词工具与画布问题。[E-S01-001][E-S01-002]

## 二、核心结论与关键要点
平台提供提示词生成器；节点定位存在画布不同步问题。[E-S01-001][E-S01-002]

## 三、核心知识体系
提示词生成器可辅助生成初稿。[E-S01-001]

平台提供提示词生成器，使用时先生成可编辑的提示词初稿，再结合当前任务补充条件并人工校准。节点定位功能会带动右侧区域变化，但中间画布没有同步跳转，因此定位后仍需要回到画布核对目标节点。[E-S01-001][E-S01-002]

## 四、方法、流程与复用清单
不会写提示词时，打开提示词生成器形成初稿，再人工校准后引用。[E-S01-001]

## 五、风险、误区与注意事项
节点定位时右侧变化，但中间画布没有同步跳转。[E-S01-002]

## 六、一页复习
记住提示词生成器和画布定位问题。`;
    const callStream = jest.fn(
      async (
        _actionKey: string,
        input: Record<string, unknown>,
      ): Promise<AsyncIterable<Record<string, unknown>>> => {
        const instruction: string = String(input.task_instruction || '');
        expect(instruction).toContain('中间画布没有同步跳转');
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
      sourceText:
        '平台提供提示词生成器。节点定位时右侧变化，但中间画布没有同步跳转。',
      sourceTitle: '智能体培训',
      styleRequirements: '输出详细笔记。',
    });

    expect(result.evidenceLedger).toContain('[S01][风险]');
    expect(result.markdown).toContain('画布没有同步跳转');
    expect(result.quality.passed).toBe(true);
  });

  it('adds deterministic source anchors when model extraction omits a fact', async () => {
    const completeNote: string = `# 智能体培训笔记

## 一、内容概览
培训介绍提示词工具与知识图谱边界。[E-S01-001][E-S01-002]

## 二、核心结论与关键要点
平台提供提示词生成器；模型版本在 3.5 以上时知识图谱可能无法生成。[E-S01-001][E-S01-002]

## 三、核心知识体系
提示词生成器可辅助生成初稿。[E-S01-001]

## 四、方法、流程与复用清单
使用提示词生成器形成初稿后再校准。[E-S01-001]

## 五、风险、误区与注意事项
模型版本在 3.5 以上时，知识图谱可能搞不出来。[E-S01-002]

## 六、一页复习
记住提示词生成器和知识图谱版本边界。`;
    const callStream = jest.fn(
      async (
        _actionKey: string,
        input: Record<string, unknown>,
      ): Promise<AsyncIterable<Record<string, unknown>>> => {
        const instruction: string = String(input.task_instruction || '');
        expect(instruction).toContain('3.5 以上');
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
      sourceText:
        '平台提供提示词生成器。模型版本在 3.5 以上时，知识图谱可能搞不出来。',
      sourceTitle: '智能体培训',
      styleRequirements: '输出详细笔记。',
    });

    expect(result.evidenceLedger).toContain('3.5 以上');
    expect(result.quality.missingEvidenceIds).toEqual([]);
  });

  it('repairs a numeric-direction contradiction found by local checks', async () => {
    const wrongNote: string = `# 完整培训笔记

## 一、内容概览
知识图谱存在版本边界。[E-S01-001]

## 二、核心结论与关键要点
知识图谱在 3.5 以下版本可能无法生成。[E-S01-001]

## 三、核心知识体系
> 转写原话：“3.5 以上可能无法生成。” [E-S01-001]

## 四、一页复习
核对版本边界。`;
    const repairedNote: string = wrongNote
      .replace('3.5 以下版本', '3.5 以上版本')
      .replace(
        '## 四、一页复习',
        `## 四、关键数据与重要事实
知识图谱的模型版本边界是 3.5 以上；该限定词和比较方向必须与证据保持一致。[E-S01-001]

原文明确表达的是“3.5 以上版本可能无法生成”，整理时必须同时保留数值、比较方向和“可能”这一不确定性限定。任何将“以上”替换为“以下”的写法都会改变事实含义，复核时应把三项信息作为一个整体检查。[E-S01-001]

## 五、一页复习`,
      );
    const callStream = jest.fn(
      async (
        _actionKey: string,
        input: Record<string, unknown>,
      ): Promise<AsyncIterable<Record<string, unknown>>> => {
        const instruction: string = String(input.task_instruction || '');
        if (instruction.includes('笔记质量修订员')) {
          expect(instruction).toContain('比较方向与证据相反');
          return createTextStream(repairedNote);
        }
        return createTextStream(wrongNote);
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
      sourceText: '知识图谱在 3.5 以上版本可能无法生成。',
      sourceTitle: '版本培训',
      styleRequirements: '输出详细笔记。',
    });

    expect(result.markdown).toContain('3.5 以上版本');
    expect(result.markdown).not.toContain('3.5 以下版本');
    expect(result.quality.passed).toBe(true);
    expect(callStream).toHaveBeenCalledTimes(2);
  });

  it('keeps every deterministic anchor in a long ledger without model compaction', async () => {
    const sourceText: string = Array.from(
      { length: 800 },
      (_: unknown, index: number): string =>
        `步骤 ${index + 1}：点击配置节点 ${index + 1}，${'保留完整上下文。'.repeat(8)}`,
    ).join('\n');
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
    const callStream = jest.fn(
      async (
        _actionKey: string,
        _input: Record<string, unknown>,
      ): Promise<AsyncIterable<Record<string, unknown>>> => {
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

    expect(result.evidenceLedger.split('\n')).toHaveLength(800);
    expect(result.evidenceLedger).toContain('[S04][数字]');
    expect(result.markdown).toContain(completeNote);
    expect(result.markdown).toContain('原文高价值细节补全');
  });

  it('returns the best repaired note with warnings when quality remains low', async () => {
    const incompleteNote: string = '# 不完整笔记\n\n只有一段简短内容。';
    const callStream = jest.fn(
      async (
        _actionKey: string,
        _input: Record<string, unknown>,
      ): Promise<AsyncIterable<Record<string, unknown>>> => {
        return createTextStream(incompleteNote);
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
      sourceText: '示例培训材料。',
      sourceTitle: '示例培训',
      styleRequirements: '保持学习笔记结构。',
    });

    expect(result.markdown).toBe(incompleteNote);
    expect(result.quality.passed).toBe(false);
    expect(result.quality.failedChecks.length).toBeGreaterThan(0);
    expect(callStream).toHaveBeenCalledTimes(3);
  });
});
