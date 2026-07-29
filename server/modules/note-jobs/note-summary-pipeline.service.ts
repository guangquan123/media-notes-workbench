import { Inject, Injectable, Logger } from '@nestjs/common';
import { CapabilityService } from '@lark-apaas/fullstack-nestjs-core';
import { createHash } from 'node:crypto';
import type {
  NoteStyle,
  SummaryGenerationInfo,
  SummaryGenerationStage,
} from '@shared/api.interface';
import { mapWithConcurrency } from '@shared/async.utils';
import {
  assessEvidenceMergeIntegrity,
  assessNoteQuality,
  buildEvidenceCoveragePlanPrompt,
  buildEvidenceExtractionPrompt,
  buildEvidenceGapAuditPrompt,
  buildEvidenceMergePrompt,
  buildNoteFactAuditPrompt,
  buildNoteRepairPrompt,
  buildNoteStructurePrompt,
  completeEvidenceCoveragePlan,
  formatFactAuditFailures,
  mergeEvidenceGapAudit,
  normalizeEvidenceCitationsForPublication,
  normalizeStructuredEvidenceLedger,
  parseNoteFactAudit,
  preserveSourceMarkdownImages,
  splitSourceText,
  type EvidenceMergeIntegrity,
  type NoteFactAudit,
  type NoteQualityAssessment,
  type SourceTextChunk,
} from './note-summary-pipeline.utils';
import {
  ExternalModelSettingsService,
  type ExternalModelCredentials,
} from './external-model-settings.service';
import { augmentEvidenceLedgerWithSourceAnchors } from './note-summary-source-anchors.utils';

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
  audit: NoteFactAudit;
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

const PIPELINE_ENGINE_VERSION = 'note-summary-v3-source-anchors-20260730';
const EVIDENCE_CACHE_TTL_MS = 24 * 60 * 60 * 1_000;
const EVIDENCE_CACHE_LIMIT = 20;
const MAX_REPAIR_ATTEMPTS = 2;
const MAX_EVIDENCE_LEDGER_CHARACTERS = 45_000;
const MAX_EVIDENCE_MERGE_ROUNDS = 3;
const EXTERNAL_MODEL_TIMEOUT_MS = 5 * 60 * 1_000;
const PIPELINE_PLUGIN_INSTANCE_ID = 'note-summary-pipeline-writer';
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
    const coveragePlanResult: PipelineModelResult =
      await this.generateModelText(
        buildEvidenceCoveragePlanPrompt({
          evidenceLedger,
          noteStyle: input.noteStyle,
          sourceTitle: input.sourceTitle,
          styleRequirements: input.styleRequirements,
        }),
        12_000,
      );
    const coveragePlan: string = completeEvidenceCoveragePlan(
      coveragePlanResult.text,
      evidenceLedger,
    );
    input.onProgress({
      modelName: coveragePlanResult.modelName,
      provider: coveragePlanResult.provider,
      stage: 'structuring',
    });
    const structureResult: PipelineModelResult = await this.generateModelText(
      buildNoteStructurePrompt({
        coveragePlan,
        evidenceLedger,
        noteStyle: input.noteStyle,
        sourceTitle: input.sourceTitle,
        styleRequirements: input.styleRequirements,
      }),
      16_384,
    );
    input.onProgress({
      modelName: structureResult.modelName,
      provider: structureResult.provider,
      stage: 'structuring',
    });

    let currentCandidate: EvaluatedNoteCandidate = await this.evaluateCandidate(
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
        stage: attempt === 1 ? 'reviewing' : 'repairing',
      });
      const checks: string[] =
        currentCandidate.quality.failedChecks.length > 0
          ? currentCandidate.quality.failedChecks
          : [
              '逐条核验草稿与证据账本的一致性，删除无依据内容并补回遗漏的高价值事实',
            ];
      const repairResult: PipelineModelResult = await this.generateModelText(
        buildNoteRepairPrompt({
          coveragePlan,
          draftNote: currentCandidate.markdown,
          evidenceLedger,
          failedChecks: checks,
          noteStyle: input.noteStyle,
          sourceTitle: input.sourceTitle,
          styleRequirements: input.styleRequirements,
        }),
        16_384,
      );
      currentCandidate = await this.evaluateCandidate(
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
    return {
      evidenceLedger,
      markdown: normalizeEvidenceCitationsForPublication(
        bestCandidate.markdown,
        evidenceLedger,
      ),
      modelName: bestCandidate.model.modelName,
      provider: bestCandidate.model.provider,
      quality: bestCandidate.quality,
    };
  }

  private async evaluateCandidate(
    model: PipelineModelResult,
    evidenceLedger: string,
    input: GenerateHighQualityNoteInput,
  ): Promise<EvaluatedNoteCandidate> {
    const markdown: string = preserveSourceMarkdownImages(
      model.text,
      input.sourceText,
    );
    const evaluatedModel: PipelineModelResult = { ...model, text: markdown };
    const deterministicQuality: NoteQualityAssessment = assessNoteQuality({
      evidenceLedger,
      note: markdown,
      noteStyle: input.noteStyle,
      sourceText: input.sourceText,
    });
    const auditResult: PipelineModelResult = await this.generateModelText(
      buildNoteFactAuditPrompt({
        draftNote: markdown,
        evidenceLedger,
        noteStyle: input.noteStyle,
        sourceTitle: input.sourceTitle,
      }),
      4_000,
    );
    const audit: NoteFactAudit = parseNoteFactAudit(auditResult.text);
    const auditFailures: string[] = formatFactAuditFailures(audit);
    const failedChecks: string[] = [
      ...new Set<string>([
        ...deterministicQuality.failedChecks,
        ...auditFailures,
      ]),
    ];
    const quality: NoteQualityAssessment = {
      ...deterministicQuality,
      failedChecks,
      passed: deterministicQuality.passed && audit.passed,
      score: Math.max(
        0,
        deterministicQuality.score - Math.min(40, auditFailures.length * 10),
      ),
    };
    input.onProgress({
      modelName: auditResult.modelName,
      provider: auditResult.provider,
      qualityScore: quality.score,
      stage: 'reviewing',
    });
    return { audit, markdown, model: evaluatedModel, quality };
  }

  private getCandidateRank(candidate: EvaluatedNoteCandidate): number {
    const auditIssueCount: number =
      candidate.audit.ambiguityIssues.length +
      candidate.audit.contradictions.length +
      candidate.audit.missingEvidenceIds.length +
      candidate.audit.unsupportedClaims.length;
    return (
      (candidate.quality.passed ? 10_000 : 0) +
      candidate.quality.score * 10 -
      auditIssueCount
    );
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
    const evidenceParts: string[] = await mapWithConcurrency(
      chunks,
      2,
      async (chunk: SourceTextChunk): Promise<string> => {
        const extractionResult: PipelineModelResult =
          await this.generateModelText(
            buildEvidenceExtractionPrompt(chunk, chunks.length),
            8_000,
          );
        input.onProgress({
          attempt: chunk.index,
          modelName: extractionResult.modelName,
          provider: extractionResult.provider,
          stage: 'extracting',
        });
        const auditResult: PipelineModelResult = await this.generateModelText(
          buildEvidenceGapAuditPrompt(chunk, extractionResult.text),
          6_000,
        );
        input.onProgress({
          attempt: chunk.index,
          modelName: auditResult.modelName,
          provider: auditResult.provider,
          stage: 'extracting',
        });
        const auditedLedger: string = mergeEvidenceGapAudit(
          extractionResult.text,
          auditResult.text,
          chunk.content,
        );
        return augmentEvidenceLedgerWithSourceAnchors(auditedLedger, chunk);
      },
    );
    const evidenceLedger: string = await this.compactEvidenceLedger(
      normalizeStructuredEvidenceLedger(evidenceParts.join('\n')),
      input,
    );
    this.setEvidenceCache(cacheKey, evidenceLedger);
    return evidenceLedger;
  }

  private async compactEvidenceLedger(
    evidenceLedger: string,
    input: GenerateHighQualityNoteInput,
  ): Promise<string> {
    let compactedLedger: string = evidenceLedger;
    for (
      let round = 1;
      round <= MAX_EVIDENCE_MERGE_ROUNDS &&
      compactedLedger.length > MAX_EVIDENCE_LEDGER_CHARACTERS;
      round += 1
    ) {
      const chunks: SourceTextChunk[] = splitSourceText(
        compactedLedger,
        MAX_EVIDENCE_LEDGER_CHARACTERS,
      );
      const mergedParts: string[] = await mapWithConcurrency(
        chunks,
        2,
        async (chunk: SourceTextChunk): Promise<string> => {
          const result: PipelineModelResult = await this.generateModelText(
            buildEvidenceMergePrompt(chunk.content),
            8_000,
          );
          input.onProgress({
            attempt: round,
            modelName: result.modelName,
            provider: result.provider,
            stage: 'extracting',
          });
          return result.text;
        },
      );
      const mergedLedger: string = mergedParts.join('\n\n');
      const mergeIntegrity: EvidenceMergeIntegrity =
        assessEvidenceMergeIntegrity(compactedLedger, mergedLedger);
      if (!mergeIntegrity.passed) {
        this.logger.warn(
          `证据账本压缩会丢失完整性信号，已放弃本轮压缩并保留原账本：缺少证据ID ${mergeIntegrity.missingEvidenceIds.join('、') || '无'}；缺少来源 ${mergeIntegrity.missingSourceIds.join('、') || '无'}；缺少类型 ${mergeIntegrity.missingEvidenceTypes.join('、') || '无'}；缺少数字 ${mergeIntegrity.missingNumbers.join('、') || '无'}`,
        );
        break;
      }
      if (mergedLedger.length >= compactedLedger.length) break;
      compactedLedger = mergedLedger;
    }
    if (compactedLedger.length > MAX_EVIDENCE_LEDGER_CHARACTERS) {
      this.logger.warn(
        `证据账本仍较长（${compactedLedger.length} 字符），将完整保留并交由长上下文模型处理`,
      );
    }
    return compactedLedger;
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
      text: await this.generateWithBuiltinModel(instruction),
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

  private async generateWithBuiltinModel(instruction: string): Promise<string> {
    const pluginInput: Record<string, unknown> = {
      task_instruction: instruction,
    };
    try {
      const streamResult: unknown = await this.capabilityService
        .load(PIPELINE_PLUGIN_INSTANCE_ID)
        .callStream(PIPELINE_PLUGIN_ACTION_KEY, pluginInput);
      const stream: AsyncIterable<Record<string, unknown>> =
        this.normalizeCapabilityStream(streamResult);
      let text = '';
      for await (const chunk of stream) {
        const delta: string = this.readTextField(chunk, [
          'content',
          'response',
        ]);
        if (!delta) continue;
        text = delta.startsWith(text) ? delta : text + delta;
      }
      if (!text.trim()) throw new Error('内置模型没有返回文本内容');
      return text.trim();
    } catch (error) {
      this.logger.error(
        JSON.stringify({
          actionKey: PIPELINE_PLUGIN_ACTION_KEY,
          error: this.getErrorMessage(error),
          inputKeys: Object.keys(pluginInput),
          outputMode: 'stream',
          pluginInstanceId: PIPELINE_PLUGIN_INSTANCE_ID,
        }),
      );
      throw new Error(`内置笔记模型调用失败：${this.getErrorMessage(error)}`);
    }
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
