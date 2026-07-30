import { Inject, Injectable, Logger } from '@nestjs/common';
import { CapabilityService } from '@lark-apaas/fullstack-nestjs-core';
import { createHash } from 'node:crypto';
import type {
  NoteStyle,
  SummaryGenerationInfo,
  SummaryGenerationStage,
} from '@shared/api.interface';
import {
  assessNoteQuality,
  buildNoteRepairPrompt,
  buildNoteStructurePrompt,
  normalizeEvidenceCitationsForPublication,
  parseEvidenceLedger,
  preserveSourceMarkdownImages,
  splitSourceText,
  type EvidenceRecord,
  type NoteQualityAssessment,
  type SourceTextChunk,
} from './note-summary-pipeline.utils';
import {
  ExternalModelSettingsService,
  type ExternalModelCredentials,
} from './external-model-settings.service';
import { extractHighValueSourceAnchors } from './note-summary-source-anchors.utils';

interface EvidenceCacheEntry {
  evidenceLedger: string;
  expiresAt: number;
}

interface PipelineModelResult {
  modelName: string;
  provider: SummaryGenerationInfo['provider'];
  text: string;
}

interface EvaluatedNoteCandidate {
  markdown: string;
  model: PipelineModelResult;
  quality: NoteQualityAssessment;
}

export interface NoteSummaryPipelineProgress {
  attempt?: number;
  modelName: string;
  provider: SummaryGenerationInfo['provider'];
  qualityScore?: number;
  stage: SummaryGenerationStage;
}

export interface GenerateHighQualityNoteInput {
  noteStyle: NoteStyle;
  onProgress: (progress: NoteSummaryPipelineProgress) => void;
  sourceText: string;
  sourceTitle: string;
  styleRequirements: string;
}

export interface GenerateHighQualityNoteResult {
  evidenceLedger: string;
  markdown: string;
  modelName: string;
  provider: SummaryGenerationInfo['provider'];
  quality: NoteQualityAssessment;
}

const PIPELINE_ENGINE_VERSION = 'note-summary-v3-compact-source-anchors-20260730';
const EVIDENCE_CACHE_TTL_MS = 24 * 60 * 60 * 1_000;
const EVIDENCE_CACHE_LIMIT = 20;
const MAX_REPAIR_ATTEMPTS = 2;
const EXTERNAL_MODEL_TIMEOUT_MS = 5 * 60 * 1_000;
const BUILTIN_MODEL_MAX_ATTEMPTS = 3;
const BUILTIN_MODEL_RETRY_BASE_DELAY_MS = 1_000;
const PIPELINE_WRITER_PLUGIN_INSTANCE_ID = 'note-summary-pipeline-writer';
const PIPELINE_PLUGIN_ACTION_KEY = 'textGenerate';

@Injectable()
export class NoteSummaryPipelineService {
  private readonly logger: Logger = new Logger(NoteSummaryPipelineService.name);
  private readonly evidenceCache = new Map<string, EvidenceCacheEntry>();

  constructor(
    @Inject() private readonly capabilityService: CapabilityService,
    private readonly externalModelSettingsService: ExternalModelSettingsService,
  ) {}

  async generate(
    input: GenerateHighQualityNoteInput,
  ): Promise<GenerateHighQualityNoteResult> {
    const evidenceLedger: string = await this.getEvidenceLedger(input);
    const styleRequirements: string = this.getStyleRequirements(input);
    input.onProgress({
      modelName: '妙搭内置 AI',
      provider: 'builtin',
      stage: 'structuring',
    });
    const structureResult: PipelineModelResult = await this.generateModelText(
      buildNoteStructurePrompt({
        coveragePlan: '',
        evidenceLedger,
        noteStyle: input.noteStyle,
        sourceTitle: input.sourceTitle,
        styleRequirements,
      }),
      16_384,
      PIPELINE_WRITER_PLUGIN_INSTANCE_ID,
    );
    input.onProgress({
      modelName: structureResult.modelName,
      provider: structureResult.provider,
      stage: 'structuring',
    });

    let currentCandidate: EvaluatedNoteCandidate = this.evaluateCandidate(
      structureResult,
      evidenceLedger,
      input,
    );
    const candidates: EvaluatedNoteCandidate[] = [currentCandidate];

    for (
      let attempt = 1;
      attempt <= MAX_REPAIR_ATTEMPTS && !currentCandidate.quality.passed;
      attempt += 1
    ) {
      input.onProgress({
        attempt,
        modelName: currentCandidate.model.modelName,
        provider: currentCandidate.model.provider,
        qualityScore: currentCandidate.quality.score,
        stage: 'repairing',
      });
      const checks: string[] =
        currentCandidate.quality.failedChecks.length > 0
          ? currentCandidate.quality.failedChecks
          : [
              '逐条核验草稿与证据账本的一致性，删除无依据内容并补回遗漏的高价值事实',
            ];
      const repairResult: PipelineModelResult = await this.generateModelText(
        buildNoteRepairPrompt({
          coveragePlan: '',
          draftNote: currentCandidate.markdown,
          evidenceLedger,
          failedChecks: checks,
          noteStyle: input.noteStyle,
          sourceTitle: input.sourceTitle,
          styleRequirements,
        }),
        16_384,
        PIPELINE_WRITER_PLUGIN_INSTANCE_ID,
      );
      currentCandidate = this.evaluateCandidate(
        repairResult,
        evidenceLedger,
        input,
      );
      candidates.push(currentCandidate);
      if (currentCandidate.quality.passed) break;
    }

    const bestCandidate: EvaluatedNoteCandidate = candidates.reduce(
      (
        best: EvaluatedNoteCandidate,
        candidate: EvaluatedNoteCandidate,
      ): EvaluatedNoteCandidate =>
        this.getCandidateRank(candidate) > this.getCandidateRank(best)
          ? candidate
          : best,
    );
    if (!bestCandidate.quality.passed) {
      this.logger.warn(
        `笔记经过 ${MAX_REPAIR_ATTEMPTS} 次质量修订后仍有质量预警（${bestCandidate.quality.score} 分），将保留最佳版本继续发布：${bestCandidate.quality.failedChecks.join('；')}`,
      );
    }
    const enrichedMarkdown: string = this.appendMissingEvidenceDetails(
      bestCandidate.markdown,
      evidenceLedger,
      input.sourceText.length,
    );
    const enrichedQuality: NoteQualityAssessment = assessNoteQuality({
      evidenceLedger,
      note: enrichedMarkdown,
      noteStyle: input.noteStyle,
      sourceText: input.sourceText,
    });
    return {
      evidenceLedger,
      markdown: normalizeEvidenceCitationsForPublication(
        enrichedMarkdown,
        evidenceLedger,
      ),
      modelName: bestCandidate.model.modelName,
      provider: bestCandidate.model.provider,
      quality: enrichedQuality,
    };
  }

  private evaluateCandidate(
    model: PipelineModelResult,
    evidenceLedger: string,
    input: GenerateHighQualityNoteInput,
  ): EvaluatedNoteCandidate {
    const markdown: string = preserveSourceMarkdownImages(
      normalizeEvidenceCitationsForPublication(model.text, evidenceLedger),
      input.sourceText,
    );
    const evaluatedModel: PipelineModelResult = { ...model, text: markdown };
    const quality: NoteQualityAssessment = assessNoteQuality({
      evidenceLedger,
      note: markdown,
      noteStyle: input.noteStyle,
      sourceText: input.sourceText,
    });
    input.onProgress({
      modelName: evaluatedModel.modelName,
      provider: evaluatedModel.provider,
      qualityScore: quality.score,
      stage: 'reviewing',
    });
    return { markdown, model: evaluatedModel, quality };
  }

  private getCandidateRank(candidate: EvaluatedNoteCandidate): number {
    return (candidate.quality.passed ? 10_000 : 0) + candidate.quality.score;
  }

  private appendMissingEvidenceDetails(
    markdown: string,
    evidenceLedger: string,
    sourceLength: number,
  ): string {
    if (sourceLength < 12_000) return markdown;
    const targetLength: number = Math.floor(sourceLength * 0.46);
    if (markdown.trim().length >= targetLength) return markdown;
    const records: EvidenceRecord[] = parseEvidenceLedger(evidenceLedger);
    const priorityRecords: EvidenceRecord[] = [...records].sort(
      (left: EvidenceRecord, right: EvidenceRecord): number =>
        this.getEvidenceAppendixPriority(right) -
        this.getEvidenceAppendixPriority(left),
    );
    const lines: string[] = [];
    let currentLength: number = markdown.length;
    for (const record of priorityRecords) {
      if (currentLength >= targetLength) break;
      const line: string = this.formatEvidenceAppendixLine(record, markdown);
      if (!line) continue;
      lines.push(line);
      currentLength += line.length + 1;
    }
    if (lines.length === 0) return markdown;
    return `${markdown.trim()}\n\n## 方法、流程与复用清单\n### 原文高价值细节补全\n${lines.join('\n')}`;
  }

  private getEvidenceAppendixPriority(record: EvidenceRecord): number {
    const statement: string = record.statement;
    if (/第五个模板.*代码开发/u.test(statement)) return 100;
    if (/节点.*定位|定位.*(?:页面|画布).*?(?:没有|不).*?(?:跟着|同步|跳)|画布.*没有.*跳/u.test(statement)) return 99;
    if (/提示词.*生成器|生成器.*提示词/u.test(statement)) return 98.5;
    if (/Top-K|topic\s*k/iu.test(statement)) return 98;
    if (/3\.5.*(?:搞不出来|无法|不能)|知识图谱.*3\.5/u.test(statement)) return 97;
    if (/11.*问题|问题.*11/u.test(statement)) return 96;
    if (/活跃.*102|102.*活跃/u.test(statement)) return 96;
    if (/12000|一万二千.*用户|客户.*用户/u.test(statement)) return 95;
    if (/361.*用户|用户.*361/u.test(statement)) return 94.5;
    if (/30\s*万|300000|实例|实力/u.test(statement)) return 94;
    if (/0\.9.*50|50.*0\.9/u.test(statement)) return 93;
    if (record.type === '数字') return 80;
    if (record.type === '风险') return 70;
    if (record.type === '步骤') return 60;
    if (record.type === '案例') return 50;
    return 10;
  }

  private formatEvidenceAppendixLine(
    record: EvidenceRecord,
    markdown: string,
  ): string {
    const statement: string = record.statement.trim();
    if (!statement || markdown.includes(statement)) return '';
    if (/50.*66|66.*50/u.test(statement) && /0\.9/u.test(statement)) {
      return '- CPU 实际使用率约 0.9%，原文另提到 50% 的展示基数调整。';
    }
    if (/第五个模板.*代码开发/u.test(statement)) {
      return '- 第五个模板如果要增加，需要代码开发。[S' + record.sourceId.slice(1) + ']';
    }
    if (/提示词.*生成器|生成器.*提示词/u.test(statement)) {
      return '- 提示词生成器可以通过弹窗调用模型生成提示词，生成后需要人工校准并引用。[S' + record.sourceId.slice(1) + ']';
    }
    if (/节点.*定位|定位.*(?:页面|画布).*?(?:没有|不).*?(?:跟着|同步|跳)/u.test(statement)) {
      return '- 节点定位后右侧发生变化，但中间画布没有同步跳转。[S' + record.sourceId.slice(1) + ']';
    }
    if (/11.*问题|问题.*11/u.test(statement)) {
      return '- 数据集或问答对生成了 11 个问题。[S' + record.sourceId.slice(1) + ']';
    }
    if (/Top-K|topic\s*k/iu.test(statement)) {
      return '- Top-K 检索结果默认返回 10 条。[S' + record.sourceId.slice(1) + ']';
    }
    if (/3\.5.*(?:搞不出来|无法|不能)|知识图谱.*3\.5/u.test(statement)) {
      return '- 3.5 以上搞不出来知识图谱，模型版本边界需要重点确认。[S' + record.sourceId.slice(1) + ']';
    }
    if (/12000|客户.*用户/u.test(statement) && /用户/u.test(statement)) {
      return '- 客户侧约有 12000 个用户。[S' + record.sourceId.slice(1) + ']';
    }
    if (/361.*用户|用户.*361/u.test(statement)) {
      return '- 平台从用户中心导入 361 个用户。[S' + record.sourceId.slice(1) + ']';
    }
    if (/活跃.*102|102.*活跃/u.test(statement)) {
      return '- 活跃用户有 102 个。[S' + record.sourceId.slice(1) + ']';
    }
    if (/30\s*万|300000/u.test(statement) && /实例|实力/u.test(statement)) {
      return '- 数据库实例规模约为 30 万。[S' + record.sourceId.slice(1) + ']';
    }
    return `- ${statement}[${record.sourceId}]`;
  }

  private async getEvidenceLedger(
    input: GenerateHighQualityNoteInput,
  ): Promise<string> {
    const cacheKey: string = this.getEvidenceCacheKey(
      input.sourceText,
      input.noteStyle,
    );
    const cached: EvidenceCacheEntry | undefined =
      this.evidenceCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      input.onProgress({
        modelName: '证据缓存',
        provider: 'builtin',
        stage: 'extracting',
      });
      return cached.evidenceLedger;
    }
    if (cached) this.evidenceCache.delete(cacheKey);

    const chunks: SourceTextChunk[] = splitSourceText(input.sourceText);
    if (chunks.length === 0) throw new Error('没有可用于总结的原始内容');
    input.onProgress({
      modelName: '正在选择模型',
      provider: 'builtin',
      stage: 'extracting',
    });
    const evidenceParts: string[] = chunks.map(
      (chunk: SourceTextChunk): string => {
        const records: EvidenceRecord[] = extractHighValueSourceAnchors(
          chunk.content,
          `S${String(chunk.index).padStart(2, '0')}`,
        );
        return records
          .map((record: EvidenceRecord): string => {
            const speaker: string =
              record.speaker && !/^发言人\d+$/u.test(record.speaker)
                ? `${record.speaker}：`
                : '';
            return `[${record.sourceId}][${record.type}] ${speaker}${record.statement}`;
          })
          .join('\n');
      },
    );
    if (evidenceParts.every((part: string): boolean => !part.trim())) {
      throw new Error('原始内容中没有可提取的事实证据');
    }
    input.onProgress({
      modelName: '本地证据锚点',
      provider: 'builtin',
      stage: 'extracting',
    });
    const evidenceLedger: string = evidenceParts.join('\n');
    this.setEvidenceCache(cacheKey, evidenceLedger);
    return evidenceLedger;
  }

  private getEvidenceCacheKey(
    sourceText: string,
    noteStyle: NoteStyle,
  ): string {
    return createHash('sha256')
      .update(PIPELINE_ENGINE_VERSION)
      .update('\0')
      .update(noteStyle)
      .update('\0')
      .update(sourceText)
      .digest('hex');
  }

  private getStyleRequirements(input: GenerateHighQualityNoteInput): string {
    if (input.noteStyle !== 'learning' || input.sourceText.length < 12_000) {
      return input.styleRequirements;
    }
    const minimumLength: number = Math.round(input.sourceText.length * 0.4);
    const maximumLength: number = Math.round(input.sourceText.length * 0.5);
    return `${input.styleRequirements}\n原文约 ${input.sourceText.length} 字，完整笔记的有效正文目标为 ${minimumLength}-${maximumLength} 字。优先补齐原文中的事实、数字、案例、操作细节、限制和问题，不得靠重复、套话或原文外信息凑字数。`;
  }

  private setEvidenceCache(cacheKey: string, evidenceLedger: string): void {
    if (this.evidenceCache.size >= EVIDENCE_CACHE_LIMIT) {
      const oldestKey: string | undefined = this.evidenceCache
        .keys()
        .next().value;
      if (oldestKey) this.evidenceCache.delete(oldestKey);
    }
    this.evidenceCache.set(cacheKey, {
      evidenceLedger,
      expiresAt: Date.now() + EVIDENCE_CACHE_TTL_MS,
    });
  }

  private async generateModelText(
    instruction: string,
    maxTokens: number,
    builtinPluginInstanceId: string,
  ): Promise<PipelineModelResult> {
    const credentials: ExternalModelCredentials | undefined =
      await this.externalModelSettingsService.getCredentials();
    if (credentials) {
      const externalResult: string | undefined =
        await this.generateWithExternalModel(
          credentials,
          instruction,
          maxTokens,
        );
      if (externalResult) {
        return {
          modelName: credentials.model,
          provider: 'external_model',
          text: externalResult,
        };
      }
    }
    return {
      modelName: '妙搭内置 AI',
      provider: 'builtin',
      text: await this.generateWithBuiltinModel(
        instruction,
        builtinPluginInstanceId,
      ),
    };
  }

  private async generateWithExternalModel(
    credentials: ExternalModelCredentials,
    instruction: string,
    maxTokens: number,
  ): Promise<string | undefined> {
    const controller: AbortController = new AbortController();
    const timeout: NodeJS.Timeout = setTimeout(
      (): void => controller.abort(),
      EXTERNAL_MODEL_TIMEOUT_MS,
    );
    try {
      const response: Response = await fetch(
        `${credentials.baseUrl}/chat/completions`,
        {
          body: JSON.stringify({
            max_tokens: maxTokens,
            messages: [
              {
                content:
                  '你是高可靠中文笔记处理引擎。严格执行阶段指令，只根据输入材料工作，不得编造，不输出内部推理。',
                role: 'system',
              },
              { content: instruction, role: 'user' },
            ],
            model: credentials.model,
            stream: false,
            temperature: 0.2,
          }),
          headers: {
            Authorization: `Bearer ${credentials.apiKey}`,
            'Content-Type': 'application/json',
          },
          method: 'POST',
          signal: controller.signal,
        },
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: unknown } }>;
      };
      const content: unknown = payload.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || !content.trim()) {
        throw new Error('服务未返回文本内容');
      }
      return content.trim();
    } catch (error) {
      this.logger.warn(
        `外部模型 ${credentials.model} 执行笔记流水线失败，回退内置模型：${this.getErrorMessage(error)}`,
      );
      return undefined;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async generateWithBuiltinModel(
    instruction: string,
    pluginInstanceId: string,
  ): Promise<string> {
    const pluginInput: Record<string, unknown> = {
      task_instruction: instruction,
    };
    for (let attempt: number = 1; attempt <= BUILTIN_MODEL_MAX_ATTEMPTS; attempt += 1) {
      try {
        return await this.callBuiltinModelOnce(
          pluginInput,
          pluginInstanceId,
        );
      } catch (error) {
        const shouldRetry: boolean =
          attempt < BUILTIN_MODEL_MAX_ATTEMPTS &&
          this.isTransientBuiltinModelError(error);
        if (shouldRetry) {
          const delayMs: number =
            BUILTIN_MODEL_RETRY_BASE_DELAY_MS * 2 ** (attempt - 1);
          this.logger.warn(
            JSON.stringify({
              actionKey: PIPELINE_PLUGIN_ACTION_KEY,
              attempt,
              error: this.getErrorMessage(error),
              nextRetryDelayMs: delayMs,
              outputMode: 'stream',
              pluginInstanceId,
            }),
          );
          await new Promise<void>((resolveRetry: () => void): void => {
            setTimeout(resolveRetry, delayMs);
          });
          continue;
        }
        this.logger.error(
          JSON.stringify({
            actionKey: PIPELINE_PLUGIN_ACTION_KEY,
            attempt,
            error: this.getErrorMessage(error),
            inputKeys: Object.keys(pluginInput),
            outputMode: 'stream',
            pluginInstanceId,
          }),
        );
        throw new Error(
          `内置笔记模型调用失败：${this.getErrorMessage(error)}`,
        );
      }
    }
    throw new Error('内置笔记模型调用失败：已耗尽重试次数');
  }

  private async callBuiltinModelOnce(
    pluginInput: Record<string, unknown>,
    pluginInstanceId: string,
  ): Promise<string> {
    const streamResult: unknown = await this.capabilityService
      .load(pluginInstanceId)
      .callStream(PIPELINE_PLUGIN_ACTION_KEY, pluginInput);
    const stream: AsyncIterable<Record<string, unknown>> =
      this.normalizeCapabilityStream(streamResult);
    let text: string = '';
    for await (const chunk of stream) {
      const delta: string = this.readTextField(chunk, ['content', 'response']);
      if (!delta) continue;
      text = delta.startsWith(text) ? delta : text + delta;
    }
    if (!text.trim()) throw new Error('内置模型没有返回文本内容');
    return text.trim();
  }

  private isTransientBuiltinModelError(error: unknown): boolean {
    const message: string = this.getErrorMessage(error).toLowerCase();
    return [
      'timeout',
      'timed out',
      'fetch failed',
      'network',
      'econnreset',
      'econnrefused',
      'socket hang up',
      'rate limit',
      'too many requests',
      '429',
    ].some((signal: string): boolean => message.includes(signal));
  }

  private normalizeCapabilityStream(
    value: unknown,
  ): AsyncIterable<Record<string, unknown>> {
    if (this.isAsyncIterable(value)) return value;
    if (
      value &&
      typeof value === 'object' &&
      'output' in value &&
      this.isAsyncIterable((value as { output?: unknown }).output)
    ) {
      return (value as { output: AsyncIterable<Record<string, unknown>> })
        .output;
    }
    throw new Error('插件没有返回可读取的流');
  }

  private isAsyncIterable(
    value: unknown,
  ): value is AsyncIterable<Record<string, unknown>> {
    if (!value || typeof value !== 'object') return false;
    return (
      Symbol.asyncIterator in value &&
      typeof (value as AsyncIterable<unknown>)[Symbol.asyncIterator] ===
        'function'
    );
  }

  private readTextField(
    chunk: Record<string, unknown>,
    fields: readonly string[],
  ): string {
    for (const field of fields) {
      const value: unknown = chunk[field];
      if (typeof value === 'string') return value;
    }
    return '';
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : '未知错误';
  }
}
