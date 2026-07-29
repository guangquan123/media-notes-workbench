import type { CapabilityService } from '@lark-apaas/fullstack-nestjs-core';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { ExternalModelSettingsService } from '../server/modules/note-jobs/external-model-settings.service';
import { NoteSummaryPipelineService } from '../server/modules/note-jobs/note-summary-pipeline.service';

interface FidelityExpectation {
  id: string;
  pattern: string;
}

interface FidelityExpectations {
  forbidden: FidelityExpectation[];
  required: FidelityExpectation[];
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
  const [sourceArg, referenceArg, expectationsArg, outputArg, candidateArg] =
    process.argv.slice(2);
  if (!sourceArg || !referenceArg || !expectationsArg || !outputArg) {
    throw new Error(
      'Usage: ts-node scripts/run-note-fidelity-regression.ts <source.md> <reference.md> <expectations.json> <output.md> [existing-candidate.md]',
    );
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

  let markdown: string;
  let quality: unknown = null;
  if (candidateArg) {
    markdown = await readFile(resolve(candidateArg), 'utf8');
  } else {
    const unavailableCapabilityService = {
      load: (): never => {
        throw new Error('内置模型在本地保真回归中不可用');
      },
    } as unknown as CapabilityService;
    const pipeline = new NoteSummaryPipelineService(
      unavailableCapabilityService,
      new ExternalModelSettingsService(),
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
      sourceImages: countMatches(sourceText, /^!\[[^\]]*\]\([^)]+\)$/gmu),
      tables: countMatches(markdown, /^\|.*\|$/gmu),
    },
    output: resolve(candidateArg || outputArg),
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
