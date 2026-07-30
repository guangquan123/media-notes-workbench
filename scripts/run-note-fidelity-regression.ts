import { CapabilityService } from '@lark-apaas/fullstack-nestjs-core';
import { Logger } from '@nestjs/common';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  createReadOnlyCapabilityRuntime,
  type ReadOnlyCapabilityRuntime,
} from '../server/common/utils/read-only-capability-runtime';
import type { ExternalModelCredentials } from '../server/modules/note-jobs/external-model-settings.service';
import { ExternalModelSettingsService } from '../server/modules/note-jobs/external-model-settings.service';
import { NoteSummaryPipelineService } from '../server/modules/note-jobs/note-summary-pipeline.service';
import { extractHighValueSourceAnchors } from '../server/modules/note-jobs/note-summary-source-anchors.utils';
import {
  splitSourceText,
  type EvidenceRecord,
  type SourceTextChunk,
} from '../server/modules/note-jobs/note-summary-pipeline.utils';

interface FidelityExpectation {
  id: string;
  pattern: string;
}

interface FidelityExpectations {
  forbidden: FidelityExpectation[];
  required: FidelityExpectation[];
}

class DisabledExternalModelSettingsService extends ExternalModelSettingsService {
  override async getCredentials(): Promise<
    ExternalModelCredentials | undefined
  > {
    return undefined;
  }
}

function countMatches(text: string, pattern: RegExp): number {
  return [...text.matchAll(pattern)].length;
}

function getEffectiveLength(markdown: string): number {
  return markdown
    .replace(/^!\[[^\]]*\]\([^)]+\)\s*$/gmu, '')
    .replace(/https?:\/\/\S+/gu, '')
    .trim().length;
}

async function main(): Promise<void> {
  const useBuiltinModel: boolean = process.argv.includes('--builtin');
  const [sourceArg, referenceArg, expectationsArg, outputArg, candidateArg] =
    process.argv
      .slice(2)
      .filter((argument: string) => argument !== '--builtin');
  if (!sourceArg || !referenceArg || !expectationsArg || !outputArg) {
    throw new Error(
      'Usage: ts-node scripts/run-note-fidelity-regression.ts <source.md> <reference.md> <expectations.json> <output.md> [existing-candidate.md] [--builtin]',
    );
  }
  if (candidateArg && useBuiltinModel) {
    throw new Error('--builtin 不能与 existing-candidate.md 同时使用');
  }
  if (useBuiltinModel) {
    Logger.overrideLogger(['error', 'warn']);
  }
  const sourceDocument: string = await readFile(resolve(sourceArg), 'utf8');
  const sourceMarker = '### 解析原文';
  const markerIndex: number = sourceDocument.indexOf(sourceMarker);
  const sourceText: string =
    markerIndex >= 0
      ? sourceDocument.slice(markerIndex + sourceMarker.length).trim()
      : sourceDocument.trim();
  const reference: string = await readFile(resolve(referenceArg), 'utf8');
  const expectations: FidelityExpectations = JSON.parse(
    await readFile(resolve(expectationsArg), 'utf8'),
  ) as FidelityExpectations;
  const sourceAnchors: EvidenceRecord[] = splitSourceText(sourceText).flatMap(
    (chunk: SourceTextChunk): EvidenceRecord[] =>
      extractHighValueSourceAnchors(
        chunk.content,
        `S${String(chunk.index).padStart(2, '0')}`,
      ),
  );
  const sourceAnchorCharacters: number = sourceAnchors.reduce(
    (total: number, record: EvidenceRecord): number =>
      total + record.statement.length,
    0,
  );
  const sourceAnchorsByType: Record<string, number> = sourceAnchors.reduce<
    Record<string, number>
  >((counts: Record<string, number>, record: EvidenceRecord) => {
    counts[record.type] = (counts[record.type] || 0) + 1;
    return counts;
  }, {});

  let markdown: string;
  let quality: unknown = null;
  if (candidateArg) {
    markdown = await readFile(resolve(candidateArg), 'utf8');
  } else {
    const runtime: ReadOnlyCapabilityRuntime | undefined = useBuiltinModel
      ? await createReadOnlyCapabilityRuntime(
          resolve(process.cwd(), 'server/capabilities'),
        )
      : undefined;
    try {
      const capabilityService: CapabilityService = runtime
        ? runtime.capabilityService
        : ({
            load: (): never => {
              throw new Error('内置模型在本地保真回归中不可用');
            },
          } as unknown as CapabilityService);
      const pipeline = new NoteSummaryPipelineService(
        capabilityService,
        useBuiltinModel
          ? new DisabledExternalModelSettingsService()
          : new ExternalModelSettingsService(),
      );
      const result = await pipeline.generate({
        noteStyle: 'learning',
        onProgress: (progress): void => {
          process.stderr.write(
            `[${progress.stage}] ${progress.modelName}${
              progress.qualityScore === undefined
                ? ''
                : ` quality=${progress.qualityScore}`
            }\n`,
          );
        },
        sourceText,
        sourceTitle: '智能体平台功能培训与项目实施要点',
        styleRequirements:
          '输出详细、可长期复用的学习笔记。事实以原始转写为准；详细主笔记必须先于一页复习，保留所有案例、数字、操作细节、产品边界、小Bug和不确定性。',
      });
      markdown = result.markdown;
      quality = result.quality;
      await writeFile(resolve(outputArg), markdown, 'utf8');
    } finally {
      await runtime?.close().catch(() => undefined);
    }
  }

  const requiredResults = expectations.required.map(
    (expectation: FidelityExpectation) => ({
      id: expectation.id,
      passed: new RegExp(expectation.pattern, 'su').test(markdown),
    }),
  );
  const forbiddenResults = expectations.forbidden.map(
    (expectation: FidelityExpectation) => ({
      id: expectation.id,
      passed: !new RegExp(expectation.pattern, 'su').test(markdown),
    }),
  );
  const effectiveLength: number = getEffectiveLength(markdown);
  const referenceEffectiveLength: number = getEffectiveLength(reference);
  const lengthRatio: number = effectiveLength / referenceEffectiveLength;
  const report = {
    acceptance: {
      forbiddenClaims: forbiddenResults.every((item) => item.passed),
      lengthRatio: lengthRatio >= 0.9 && lengthRatio <= 1.15,
      qualityGate:
        quality === null ? null : (quality as { passed: boolean }).passed,
      requiredFacts: requiredResults.every((item) => item.passed),
    },
    forbiddenResults,
    metrics: {
      effectiveLength,
      headings: countMatches(markdown, /^#{1,6}\s+/gmu),
      images: countMatches(markdown, /^!\[[^\]]*\]\([^)]+\)$/gmu),
      lengthRatio: Number(lengthRatio.toFixed(3)),
      referenceEffectiveLength,
      sourceAnchorCharacters,
      sourceAnchorCount: sourceAnchors.length,
      sourceAnchorRatio: Number(
        (sourceAnchorCharacters / Math.max(1, sourceText.length)).toFixed(3),
      ),
      sourceAnchorsByType,
      sourceImages: countMatches(sourceText, /^!\[[^\]]*\]\([^)]+\)$/gmu),
      tables: countMatches(markdown, /^\|.*\|$/gmu),
    },
    output: resolve(candidateArg || outputArg),
    provider: candidateArg
      ? 'existing_candidate'
      : useBuiltinModel
        ? 'builtin'
        : 'external_with_builtin_fallback',
    quality,
    requiredResults,
  };
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (
    !report.acceptance.forbiddenClaims ||
    !report.acceptance.lengthRatio ||
    !report.acceptance.requiredFacts ||
    report.acceptance.qualityGate === false
  ) {
    process.exitCode = 2;
  }
}

void main().catch((error: unknown): void => {
  process.stderr.write(
    `${error instanceof Error ? error.stack || error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
