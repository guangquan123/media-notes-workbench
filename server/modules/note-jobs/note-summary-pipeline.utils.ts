import type { NoteStyle } from '@shared/api.interface';

interface NoteStructurePromptInput {
  coveragePlan?: string;
  evidenceLedger: string;
  noteStyle: NoteStyle;
  sourceTitle: string;
  styleRequirements: string;
}

interface EvidenceCoveragePlanPromptInput {
  evidenceLedger: string;
  noteStyle: NoteStyle;
  sourceTitle: string;
  styleRequirements: string;
}

interface NoteFactAuditPromptInput {
  draftNote: string;
  evidenceLedger: string;
  noteStyle: NoteStyle;
  sourceTitle: string;
}

interface NoteRepairPromptInput extends NoteStructurePromptInput {
  draftNote: string;
  failedChecks: string[];
}

interface NoteQualityInput {
  evidenceLedger?: string;
  note: string;
  noteStyle: NoteStyle;
  sourceText: string;
}

export interface SourceTextChunk {
  content: string;
  endOffset: number;
  index: number;
  startOffset: number;
}

export interface NoteQualityAssessment {
  evidenceCoverage: number;
  evidenceGroundingCoverage: number;
  evidenceItemCoverage: number;
  failedChecks: string[];
  minimumLength: number;
  missingEvidenceCoverage: string[];
  missingEvidenceIds: string[];
  missingSections: string[];
  missingSourceIds: string[];
  missingVisualUrls: string[];
  noteLength: number;
  numberCoverage: number;
  passed: boolean;
  semanticContradictions: string[];
  score: number;
  sourceAnchorCoverage: number;
  sourceNumberCount: number;
  unexpectedSections: string[];
  ungroundedEvidenceIds: string[];
  visualCoverage: number;
}

export interface EvidenceMergeIntegrity {
  missingEvidenceIds: string[];
  missingEvidenceTypes: string[];
  missingNumbers: string[];
  missingSourceIds: string[];
  passed: boolean;
}

export type EvidenceType =
  | '事实'
  | '数字'
  | '原话'
  | '案例'
  | '步骤'
  | '风险'
  | '限制'
  | '术语'
  | '关系'
  | '对比'
  | '观点'
  | '结论'
  | '建议'
  | '待办'
  | '分歧'
  | '待研究';

export type NumericClaimOperator =
  | 'eq'
  | 'gte'
  | 'lte'
  | 'gt'
  | 'lt'
  | 'increase'
  | 'decrease'
  | 'range';

export interface NumericEvidenceClaim {
  operator: NumericClaimOperator;
  qualifier?: string;
  relatedValue?: string;
  subject: string;
  unit?: string;
  value: string;
}

export interface EvidenceRecord {
  asrRisk: 'low' | 'medium' | 'high';
  certainty: 'direct' | 'inferred' | 'uncertain';
  id: string;
  numericClaims?: NumericEvidenceClaim[];
  quote?: string;
  sourceId: string;
  speaker?: string;
  statement: string;
  timestamp?: string;
  type: EvidenceType;
}

export interface EvidencePlanAssessment {
  evidenceCoverage: number;
  missingEvidenceIds: string[];
  passed: boolean;
}

export interface FactAuditIssue {
  evidenceId?: string;
  message: string;
}

export interface NoteFactAudit {
  ambiguityIssues: FactAuditIssue[];
  contradictions: FactAuditIssue[];
  missingEvidenceIds: string[];
  passed: boolean;
  unsupportedClaims: string[];
}

interface EvidenceCoverageRequirement {
  aliases?: readonly string[];
  label: string;
  signals?: readonly string[];
  types: readonly string[];
}

const LEARNING_REQUIRED_SECTIONS: ReadonlyArray<{
  aliases: readonly string[];
  label: string;
}> = [
  { aliases: ['内容概览'], label: '内容概览' },
  {
    aliases: [
      '核心结论与关键要点',
      '核心结论或关键要点',
      '核心结论',
      '关键要点',
    ],
    label: '核心结论与关键要点',
  },
  { aliases: ['核心知识体系'], label: '核心知识体系' },
  { aliases: ['一页复习'], label: '一页复习' },
];

const MEETING_REQUIRED_SECTIONS: ReadonlyArray<{
  aliases: readonly string[];
  label: string;
}> = [
  { aliases: ['会议议程'], label: '会议议程' },
  { aliases: ['会议内容'], label: '会议内容' },
  { aliases: ['会后待办'], label: '会后待办' },
];

const LEARNING_EVIDENCE_REQUIREMENTS: readonly EvidenceCoverageRequirement[] = [
  {
    aliases: ['知识关系与整体逻辑', '知识关系', '整体逻辑'],
    label: '知识关系与整体逻辑',
    types: ['关系'],
  },
  {
    aliases: ['方法、流程与复用清单', '方法与流程', '流程与复用清单'],
    label: '方法、流程与复用清单',
    types: ['步骤', '建议', '待办'],
  },
  {
    aliases: ['重要案例', '案例'],
    label: '重要案例',
    types: ['案例'],
  },
  {
    aliases: ['对比与区别', '对比', '区别'],
    label: '对比与区别',
    types: ['对比'],
  },
  {
    aliases: ['关键数据与重要事实', '关键数据', '重要事实'],
    label: '关键数据与重要事实',
    types: ['数字'],
  },
  {
    aliases: ['风险、误区与注意事项', '风险与注意事项', '风险', '限制与边界'],
    label: '风险、误区与注意事项',
    types: ['风险', '限制', '分歧'],
  },
  {
    aliases: ['关键术语', '术语'],
    label: '关键术语',
    types: ['术语'],
  },
  {
    aliases: ['仍需进一步研究的问题', '待研究问题', '进一步研究'],
    label: '仍需进一步研究的问题',
    types: ['待研究'],
  },
];

const MEETING_EVIDENCE_REQUIREMENTS: readonly EvidenceCoverageRequirement[] = [
  {
    label: '分歧或待确认问题',
    signals: ['分歧', '不同意见'],
    types: ['分歧'],
  },
  { label: '风险', signals: ['风险'], types: ['风险'] },
  {
    label: '限制、前置条件或依赖',
    signals: ['限制', '前置条件', '边界'],
    types: ['限制'],
  },
  { label: '建议', signals: ['建议'], types: ['建议'] },
  {
    label: '会议结论',
    signals: ['会议结论', '决定', '共识', '已确认'],
    types: ['结论'],
  },
];

const PIPELINE_TRUTHFULNESS_RULES = `真实性红线：
1. 只能使用提供的原始材料或证据账本，不得补充原文没有的信息，也不得用常识补齐。
2. 不改变数字、专有名词、因果关系、时间顺序和观点归属。
3. “讨论过”不等于“已决定”，“建议”不等于“结论”。
4. 无法确认的信息标记【待人工确认】，不得猜测。
5. 转写内容只能称为“转写原话”；只有原文带可靠说话人标签时才能标注说话人。`;

const EVIDENCE_TYPES: ReadonlySet<string> = new Set<string>([
  '事实',
  '数字',
  '原话',
  '案例',
  '步骤',
  '风险',
  '限制',
  '术语',
  '关系',
  '对比',
  '观点',
  '结论',
  '建议',
  '待办',
  '分歧',
  '待研究',
]);

const NUMERIC_OPERATORS: ReadonlySet<string> = new Set<string>([
  'eq',
  'gte',
  'lte',
  'gt',
  'lt',
  'increase',
  'decrease',
  'range',
]);
const NO_MISSING_EVIDENCE_MARKER = 'NO_MISSING_EVIDENCE';

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function normalizeHeading(heading: string): string {
  return heading
    .replace(/[*_`]/gu, '')
    .replace(/^[一二三四五六七八九十\d]+[、.．:：\s-]*/u, '')
    .replace(/\s+/gu, '')
    .trim();
}

function extractHeadings(note: string): string[] {
  const headings: string[] = [];
  const headingPattern: RegExp = /^#{1,4}\s+(.+)$/gmu;
  for (const match of note.matchAll(headingPattern)) {
    const heading: string | undefined = match[1];
    if (heading) headings.push(normalizeHeading(heading));
  }
  return headings;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getRequiredString(
  value: Record<string, unknown>,
  key: string,
): string | undefined {
  const candidate: unknown = value[key];
  return typeof candidate === 'string' && candidate.trim()
    ? candidate.trim()
    : undefined;
}

function normalizeSourceId(sourceId: string): string {
  return sourceId.replace(/^\[/u, '').replace(/\]$/u, '').trim();
}

function parseNumericClaims(
  value: unknown,
  fallbackSubject: string,
): NumericEvidenceClaim[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const claims: NumericEvidenceClaim[] = [];
  for (const item of value) {
    if (!isObject(item)) continue;
    const operator: string | undefined = getRequiredString(item, 'operator');
    const subject: string =
      getRequiredString(item, 'subject') || fallbackSubject;
    const claimValue: string | undefined = getRequiredString(item, 'value');
    if (
      !operator ||
      !NUMERIC_OPERATORS.has(operator) ||
      !claimValue
    ) {
      continue;
    }
    claims.push({
      operator: operator as NumericClaimOperator,
      qualifier: getRequiredString(item, 'qualifier'),
      relatedValue: getRequiredString(item, 'relatedValue'),
      subject,
      unit: getRequiredString(item, 'unit'),
      value: claimValue,
    });
  }
  return claims.length > 0 ? claims : undefined;
}

function inferNumericOperator(
  statement: string,
  valueIndex: number,
  valueLength: number,
): NumericClaimOperator {
  const context: string = statement.slice(
    Math.max(0, valueIndex - 12),
    Math.min(statement.length, valueIndex + valueLength + 12),
  );
  if (/不低于|不少于|至少|以上/u.test(context)) return 'gte';
  if (/不超过|不大于|至多|以下/u.test(context)) return 'lte';
  if (/超过|高于|大于/u.test(context)) return 'gt';
  if (/低于|小于/u.test(context)) return 'lt';
  if (/减少|下降|降低|下调/u.test(context)) return 'decrease';
  if (/增加|提高|提升|上升|上调|加个|加了/u.test(context)) {
    return 'increase';
  }
  return 'eq';
}

function parseLegacyNumericClaims(
  statement: string,
): NumericEvidenceClaim[] | undefined {
  const claims: NumericEvidenceClaim[] = [];
  for (const match of statement.matchAll(/\d+(?:[,.]+\d+)*(?:[%％])?/gu)) {
    const rawValue: string | undefined = match[0];
    const valueIndex: number | undefined = match.index;
    if (!rawValue || valueIndex === undefined) continue;
    claims.push({
      operator: inferNumericOperator(statement, valueIndex, rawValue.length),
      subject: statement,
      value: rawValue
        .replace(/,+/gu, '')
        .replace(/[.]+/gu, '.')
        .replace(/％/gu, '%'),
    });
  }
  return claims.length > 0 ? claims : undefined;
}

function parseJsonEvidenceLine(line: string): EvidenceRecord | undefined {
  if (!line.startsWith('{') || !line.endsWith('}')) return undefined;
  try {
    const value: unknown = JSON.parse(line);
    if (!isObject(value)) return undefined;
    const id: string | undefined = getRequiredString(value, 'id');
    const rawSourceId: string | undefined = getRequiredString(
      value,
      'sourceId',
    );
    const statement: string | undefined = getRequiredString(value, 'statement');
    const type: string | undefined = getRequiredString(value, 'type');
    if (
      !id ||
      !/^E-S\d+-\d+$/u.test(id) ||
      !rawSourceId ||
      !statement ||
      !type ||
      !EVIDENCE_TYPES.has(type)
    ) {
      return undefined;
    }
    const sourceId: string = normalizeSourceId(rawSourceId);
    if (!/^S\d+$/u.test(sourceId)) return undefined;
    const certaintyValue: string | undefined = getRequiredString(
      value,
      'certainty',
    );
    const asrRiskValue: string | undefined = getRequiredString(
      value,
      'asrRisk',
    );
    const certainty: EvidenceRecord['certainty'] =
      certaintyValue === 'inferred' || certaintyValue === 'uncertain'
        ? certaintyValue
        : 'direct';
    const asrRisk: EvidenceRecord['asrRisk'] =
      asrRiskValue === 'medium' || asrRiskValue === 'high'
        ? asrRiskValue
        : 'low';
    return {
      asrRisk,
      certainty,
      id,
      numericClaims: parseNumericClaims(value.numericClaims, statement),
      quote: getRequiredString(value, 'quote'),
      sourceId,
      speaker: getRequiredString(value, 'speaker'),
      statement,
      timestamp: getRequiredString(value, 'timestamp'),
      type: type as EvidenceType,
    };
  } catch {
    return undefined;
  }
}

export function parseEvidenceLedger(evidenceLedger: string): EvidenceRecord[] {
  const records: EvidenceRecord[] = [];
  const legacyCounts: Map<string, number> = new Map<string, number>();
  for (const rawLine of evidenceLedger.split('\n')) {
    const line: string = rawLine.trim();
    if (!line || /^```(?:jsonl?|text)?$/iu.test(line)) continue;
    const structured: EvidenceRecord | undefined = parseJsonEvidenceLine(line);
    if (structured) {
      records.push(structured);
      continue;
    }
    const legacyMatch: RegExpMatchArray | null = line.match(
      /^((?:\[S\d+\])+)\[([^\]]+)\]\s*(.+)$/u,
    );
    const rawSources: string | undefined = legacyMatch?.[1];
    const type: string | undefined = legacyMatch?.[2]?.trim();
    const statement: string | undefined = legacyMatch?.[3]?.trim();
    if (!rawSources || !type || !statement || !EVIDENCE_TYPES.has(type)) {
      continue;
    }
    const sourceMatch: RegExpMatchArray | null = rawSources.match(/S\d+/u);
    const sourceId: string | undefined = sourceMatch?.[0];
    if (!sourceId) continue;
    const nextCount: number = (legacyCounts.get(sourceId) || 0) + 1;
    legacyCounts.set(sourceId, nextCount);
    records.push({
      asrRisk: statement.includes('【待人工确认】') ? 'high' : 'low',
      certainty: statement.includes('【待人工确认】') ? 'uncertain' : 'direct',
      id: `L-${sourceId}-${String(nextCount).padStart(3, '0')}`,
      numericClaims:
        type === '数字' ? parseLegacyNumericClaims(statement) : undefined,
      sourceId,
      statement,
      type: type as EvidenceType,
    });
  }
  return records;
}

export function normalizeStructuredEvidenceLedger(
  evidenceLedger: string,
): string {
  if (/^(?:\[S\d+\])+\[[^\]]+\]\s*.+$/mu.test(evidenceLedger)) {
    return evidenceLedger;
  }
  const candidateLines: string[] = evidenceLedger
    .split('\n')
    .map((line: string): string => line.trim())
    .filter((line: string): boolean => line.startsWith('{'));
  if (candidateLines.length === 0) return evidenceLedger;
  const records: EvidenceRecord[] = candidateLines
    .map(parseJsonEvidenceLine)
    .filter((record: EvidenceRecord | undefined): record is EvidenceRecord =>
      Boolean(record),
    );
  if (records.length !== candidateLines.length) return evidenceLedger;

  const sourceCounts: Map<string, number> = new Map<string, number>();
  return records
    .map((record: EvidenceRecord): string => {
      const nextCount: number = (sourceCounts.get(record.sourceId) || 0) + 1;
      sourceCounts.set(record.sourceId, nextCount);
      return JSON.stringify({
        ...(record.asrRisk !== 'low' ? { asrRisk: record.asrRisk } : {}),
        ...(record.certainty !== 'direct'
          ? { certainty: record.certainty }
          : {}),
        id: `E-${record.sourceId}-${String(nextCount).padStart(3, '0')}`,
        ...(record.numericClaims
          ? {
              numericClaims: record.numericClaims.map(
                (claim: NumericEvidenceClaim) => ({
                  operator: claim.operator,
                  ...(claim.qualifier ? { qualifier: claim.qualifier } : {}),
                  ...(claim.relatedValue
                    ? { relatedValue: claim.relatedValue }
                    : {}),
                  ...(claim.subject !== record.statement
                    ? { subject: claim.subject }
                    : {}),
                  ...(claim.unit ? { unit: claim.unit } : {}),
                  value: claim.value,
                }),
              ),
            }
          : {}),
        ...(record.quote && record.quote !== record.statement
          ? { quote: record.quote }
          : {}),
        sourceId: record.sourceId,
        ...(record.speaker && !/^发言人\d+$/u.test(record.speaker)
          ? { speaker: record.speaker }
          : {}),
        statement: record.statement,
        type: record.type,
      });
    })
    .join('\n');
}

export function mergeEvidenceGapAudit(
  evidenceLedger: string,
  auditResult: string,
  sourceText: string,
): string {
  if (auditResult.trim() === NO_MISSING_EVIDENCE_MARKER) {
    return evidenceLedger;
  }
  const supplementalRecords: EvidenceRecord[] =
    parseEvidenceLedger(auditResult);
  if (supplementalRecords.length === 0) {
    throw new Error('证据缺口审计结果不可解析');
  }
  const groundedRecords: EvidenceRecord[] = supplementalRecords.filter(
    (record: EvidenceRecord): boolean =>
      Boolean(record.quote && sourceText.includes(record.quote)),
  );
  if (groundedRecords.length === 0) return evidenceLedger;
  const groundedAuditResult: string = groundedRecords
    .map((record: EvidenceRecord): string => JSON.stringify(record))
    .join('\n');
  return normalizeStructuredEvidenceLedger(
    `${evidenceLedger.trim()}\n${groundedAuditResult}`,
  );
}

function extractExplicitEvidenceIds(evidenceLedger: string): Set<string> {
  return new Set<string>(
    parseEvidenceLedger(evidenceLedger)
      .filter((record: EvidenceRecord): boolean => record.id.startsWith('E-'))
      .map((record: EvidenceRecord): string => record.id),
  );
}

function extractEvidenceTypes(evidenceLedger: string): Set<string> {
  return new Set<string>(
    parseEvidenceLedger(evidenceLedger).map(
      (record: EvidenceRecord): string => record.type,
    ),
  );
}

function extractSourceIds(text: string): Set<string> {
  const sourceIds: Set<string> = new Set<string>();
  for (const match of text.matchAll(/\[S\d+\]/gu)) {
    const sourceId: string | undefined = match[0];
    if (sourceId) sourceIds.add(sourceId);
  }
  for (const record of parseEvidenceLedger(text)) {
    sourceIds.add(`[${record.sourceId}]`);
  }
  return sourceIds;
}

function getActiveEvidenceRequirements(
  evidenceLedger: string,
  noteStyle: NoteStyle,
): EvidenceCoverageRequirement[] {
  if (!evidenceLedger.trim()) return [];
  const evidenceTypes: Set<string> = extractEvidenceTypes(evidenceLedger);
  const requirements: readonly EvidenceCoverageRequirement[] =
    noteStyle === 'meeting'
      ? MEETING_EVIDENCE_REQUIREMENTS
      : LEARNING_EVIDENCE_REQUIREMENTS;
  return requirements.filter((requirement): boolean =>
    requirement.types.some((type: string): boolean => evidenceTypes.has(type)),
  );
}

function getMissingEvidenceCoverage(
  note: string,
  noteStyle: NoteStyle,
  requirements: readonly EvidenceCoverageRequirement[],
): string[] {
  const headings: string[] = extractHeadings(note);
  return requirements
    .filter((requirement): boolean => {
      if (noteStyle === 'meeting') {
        return !(requirement.signals || []).some((signal: string): boolean =>
          note.includes(signal),
        );
      }
      return !(requirement.aliases || []).some((alias: string): boolean =>
        headings.some((heading: string): boolean =>
          heading.includes(normalizeHeading(alias)),
        ),
      );
    })
    .map((requirement): string => requirement.label);
}

function getMissingSourceIds(note: string, evidenceLedger: string): string[] {
  const expectedSourceIds: Set<string> = extractSourceIds(evidenceLedger);
  if (expectedSourceIds.size === 0) return [];
  const noteSourceIds: Set<string> = extractSourceIds(note);
  for (const record of parseEvidenceLedger(evidenceLedger)) {
    if (note.includes(`[${record.id}]`)) {
      noteSourceIds.add(`[${record.sourceId}]`);
    }
  }
  return [...expectedSourceIds].filter(
    (sourceId: string): boolean => !noteSourceIds.has(sourceId),
  );
}

function getMissingEvidenceIds(note: string, evidenceLedger: string): string[] {
  return [...extractExplicitEvidenceIds(evidenceLedger)].filter(
    (evidenceId: string): boolean => !note.includes(`[${evidenceId}]`),
  );
}

function getEvidenceCitationContexts(
  note: string,
  evidenceId: string,
): string[] {
  const lines: string[] = note.split('\n');
  const marker = `[${evidenceId}]`;
  const contexts: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index].includes(marker)) continue;
    const sameLine: string = cleanEvidenceContext(lines[index]);
    if (sameLine) {
      contexts.push(sameLine);
      continue;
    }
    for (let previous = index - 1; previous >= 0; previous -= 1) {
      const previousLine: string = cleanEvidenceContext(lines[previous]);
      if (!previousLine) continue;
      contexts.push(previousLine);
      break;
    }
  }
  return contexts;
}

function cleanEvidenceContext(value: string): string {
  return value
    .replace(/\[E-S\d+-\d+\]/gu, ' ')
    .replace(/\[S\d+\]/gu, ' ')
    .replace(/https?:\/\/\S+/gu, ' ')
    .replace(/^[#>|*+\-\d.)\s]+/u, '')
    .replace(/[|*_`~]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function normalizeComparableText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\s“”"'`，。！？；、,:：.!?;（）()[\]{}|*_~#>+-]/gu, '');
}

function extractGroundingNumbers(value: string): Set<string> {
  return new Set<string>(
    [...value.matchAll(/\d+(?:[,.]\d+)*(?:[%％])?/gu)]
      .map((match: RegExpMatchArray): string => match[0])
      .map((number: string): string =>
        number.replace(/,/gu, '').replace(/％/gu, '%'),
      ),
  );
}

function extractGroundingTokens(value: string): Set<string> {
  const tokens: Set<string> = new Set<string>();
  for (const match of value
    .toLowerCase()
    .matchAll(/[\p{Script=Han}]+|[a-z][a-z0-9_-]+/gu)) {
    const token: string | undefined = match[0];
    if (!token) continue;
    if (/^[a-z]/u.test(token)) {
      tokens.add(token);
      continue;
    }
    for (let index = 0; index < token.length - 1; index += 1) {
      tokens.add(token.slice(index, index + 2));
    }
  }
  return tokens;
}

function contextGroundsEvidence(
  context: string,
  record: EvidenceRecord,
): boolean {
  const evidenceText: string = `${record.statement} ${record.quote || ''}`;
  const evidenceNumbers: Set<string> = extractGroundingNumbers(evidenceText);
  const contextNumbers: Set<string> = extractGroundingNumbers(context);
  if (
    evidenceNumbers.size > 0 &&
    [...evidenceNumbers].some(
      (value: string): boolean => !contextNumbers.has(value),
    )
  ) {
    return false;
  }

  const normalizedEvidence: string = normalizeComparableText(evidenceText);
  const normalizedContext: string = normalizeComparableText(context);
  if (
    normalizedContext.length >= 6 &&
    (normalizedEvidence.includes(normalizedContext) ||
      normalizedContext.includes(normalizedEvidence))
  ) {
    return true;
  }

  const evidenceTokens: Set<string> = extractGroundingTokens(evidenceText);
  const contextTokens: Set<string> = extractGroundingTokens(context);
  const overlap: number = [...evidenceTokens].filter((token: string): boolean =>
    contextTokens.has(token),
  ).length;
  const minimumOverlap: number = evidenceTokens.size <= 3 ? 1 : 2;
  return overlap >= minimumOverlap;
}

function getUngroundedEvidenceIds(
  note: string,
  evidenceLedger: string,
): string[] {
  return parseEvidenceLedger(evidenceLedger)
    .filter((record: EvidenceRecord): boolean => record.id.startsWith('E-'))
    .filter((record: EvidenceRecord): boolean =>
      note.includes(`[${record.id}]`),
    )
    .filter((record: EvidenceRecord): boolean => {
      const contexts: string[] = getEvidenceCitationContexts(note, record.id);
      return !contexts.some((context: string): boolean =>
        contextGroundsEvidence(context, record),
      );
    })
    .map((record: EvidenceRecord): string => record.id);
}

export function assessEvidencePlanCoverage(
  coveragePlan: string,
  evidenceLedger: string,
): EvidencePlanAssessment {
  const evidenceIds: Set<string> = extractExplicitEvidenceIds(evidenceLedger);
  const missingEvidenceIds: string[] = [...evidenceIds].filter(
    (evidenceId: string): boolean => !coveragePlan.includes(`[${evidenceId}]`),
  );
  return {
    evidenceCoverage:
      evidenceIds.size === 0
        ? 1
        : (evidenceIds.size - missingEvidenceIds.length) / evidenceIds.size,
    missingEvidenceIds,
    passed: missingEvidenceIds.length === 0,
  };
}

export function completeEvidenceCoveragePlan(
  coveragePlan: string,
  evidenceLedger: string,
): string {
  const missingIds: Set<string> = new Set<string>(
    assessEvidencePlanCoverage(coveragePlan, evidenceLedger).missingEvidenceIds,
  );
  if (missingIds.size === 0) return coveragePlan;
  const fallbackItems: string[] = parseEvidenceLedger(evidenceLedger)
    .filter((record: EvidenceRecord): boolean => missingIds.has(record.id))
    .map(
      (record: EvidenceRecord): string =>
        `- [${record.id}] ${record.statement}${
          record.certainty !== 'direct' || record.asrRisk === 'high'
            ? '【待人工确认】'
            : ''
        }`,
    );
  if (fallbackItems.length === 0) return coveragePlan;
  return `${coveragePlan.trim()}\n\n## 系统补齐的证据落点\n${fallbackItems.join('\n')}`;
}

function hasMarkdownTitle(note: string): boolean {
  return /^#\s+[^#\s].*$/mu.test(note);
}

function getMissingSections(note: string, noteStyle: NoteStyle): string[] {
  const headings: string[] = extractHeadings(note);
  const requiredSections =
    noteStyle === 'meeting'
      ? MEETING_REQUIRED_SECTIONS
      : LEARNING_REQUIRED_SECTIONS;
  const missingSections: string[] = requiredSections
    .filter(
      (section): boolean =>
        !section.aliases.some((alias: string): boolean =>
          headings.some((heading: string): boolean =>
            heading.includes(normalizeHeading(alias)),
          ),
        ),
    )
    .map((section): string => section.label);
  if (noteStyle === 'learning' && !hasMarkdownTitle(note)) {
    missingSections.unshift('标题');
  }
  return missingSections;
}

function getUnexpectedMeetingSections(note: string): string[] {
  const expectedAliases: string[] = MEETING_REQUIRED_SECTIONS.flatMap(
    (section): string[] =>
      section.aliases.map((alias: string): string => normalizeHeading(alias)),
  );
  const sections: string[] = [];
  const headingPattern: RegExp = /^##\s+(.+)$/gmu;
  for (const match of note.matchAll(headingPattern)) {
    const rawHeading: string | undefined = match[1];
    if (!rawHeading) continue;
    const normalized: string = normalizeHeading(rawHeading);
    const expected: boolean = expectedAliases.some((alias: string): boolean =>
      normalized.includes(alias),
    );
    if (!expected) sections.push(rawHeading.replace(/[*_`]/gu, '').trim());
  }
  return sections;
}

function extractSignificantNumbers(text: string): Set<string> {
  const values: Set<string> = new Set<string>();
  const contentWithoutLocations: string = text
    .replace(/^\[来源\s+\d+[^\]]*\]\s*$/gmu, ' ')
    .replace(/发言人\d+(?=\s*[:：])/gu, '发言人')
    .replace(/\[?\d{1,2}:\d{2}(?::\d{2})?\]?/gu, ' ')
    .replace(/https?:\/\/\S+/gu, ' ');
  const matches: IterableIterator<RegExpMatchArray> =
    contentWithoutLocations.matchAll(/\d+(?:[,.]\d+)*(?:[%％])?/gu);
  for (const match of matches) {
    const raw: string | undefined = match[0];
    if (!raw) continue;
    const normalized: string = raw.replace(/,/gu, '').replace(/％/gu, '%');
    values.add(normalized);
  }
  return values;
}

function extractEvidenceLedgerNumbers(evidenceLedger: string): Set<string> {
  const records: EvidenceRecord[] = parseEvidenceLedger(evidenceLedger);
  const structuredValues: string[] = records.flatMap(
    (record: EvidenceRecord): string[] =>
      record.numericClaims?.flatMap((claim: NumericEvidenceClaim): string[] =>
        [claim.value, claim.relatedValue].filter(
          (value: string | undefined): value is string => Boolean(value),
        ),
      ) || [],
  );
  if (structuredValues.length > 0) {
    return new Set<string>(
      structuredValues.map((value: string): string =>
        value.replace(/,/gu, '').replace(/％/gu, '%'),
      ),
    );
  }
  const numericEvidence: string = evidenceLedger
    .split('\n')
    .filter((line: string): boolean => /\]\[数字\]/u.test(line))
    .map((line: string): string =>
      line.replace(/^(?:\[S\d+\])+\[数字\]\s*/u, ''),
    )
    .join('\n');
  return extractSignificantNumbers(numericEvidence);
}

function getEvidenceInformationLength(evidenceLedger: string): number {
  const records: EvidenceRecord[] = parseEvidenceLedger(evidenceLedger);
  if (records.length === 0) return evidenceLedger.trim().length;
  return records.reduce(
    (total: number, record: EvidenceRecord): number =>
      total + record.statement.length + (record.quote?.length || 0),
    0,
  );
}

function findNumberWindows(note: string, value: string): string[] {
  const windows: string[] = [];
  let startIndex = 0;
  while (startIndex < note.length) {
    const matchIndex: number = note.indexOf(value, startIndex);
    if (matchIndex < 0) break;
    windows.push(
      note.slice(
        Math.max(0, matchIndex - 18),
        Math.min(note.length, matchIndex + value.length + 18),
      ),
    );
    startIndex = matchIndex + value.length;
  }
  return windows;
}

function getOppositeDirectionSignals(
  operator: NumericClaimOperator,
): readonly string[] {
  if (operator === 'gte' || operator === 'gt') {
    return ['以下', '低于', '小于', '不超过', '至多'];
  }
  if (operator === 'lte' || operator === 'lt') {
    return ['以上', '高于', '大于', '不少于', '至少'];
  }
  if (operator === 'increase') return ['减少', '下降', '降低', '下调'];
  if (operator === 'decrease') return ['增加', '上升', '提高', '上调'];
  return [];
}

function getSemanticDirectionContradictions(
  note: string,
  evidenceLedger: string,
): string[] {
  const contradictions: string[] = [];
  for (const record of parseEvidenceLedger(evidenceLedger)) {
    for (const claim of record.numericClaims || []) {
      const oppositeSignals: readonly string[] = getOppositeDirectionSignals(
        claim.operator,
      );
      if (oppositeSignals.length === 0) continue;
      const windows: string[] = findNumberWindows(note, claim.value);
      const oppositeSignal: string | undefined = oppositeSignals.find(
        (signal: string): boolean =>
          windows.some((window: string): boolean => window.includes(signal)),
      );
      if (oppositeSignal) {
        contradictions.push(
          `${record.id} 的数值 ${claim.value} 比较方向与证据相反，正文出现“${oppositeSignal}”`,
        );
      }
    }
  }
  return contradictions;
}

function getMissingSetValues(
  expected: ReadonlySet<string>,
  actual: ReadonlySet<string>,
): string[] {
  return [...expected].filter((value: string): boolean => !actual.has(value));
}

export function assessEvidenceMergeIntegrity(
  originalLedger: string,
  mergedLedger: string,
): EvidenceMergeIntegrity {
  const missingEvidenceIds: string[] = getMissingSetValues(
    extractExplicitEvidenceIds(originalLedger),
    extractExplicitEvidenceIds(mergedLedger),
  );
  const missingEvidenceTypes: string[] = getMissingSetValues(
    extractEvidenceTypes(originalLedger),
    extractEvidenceTypes(mergedLedger),
  );
  const missingNumbers: string[] = getMissingSetValues(
    extractEvidenceLedgerNumbers(originalLedger),
    extractEvidenceLedgerNumbers(mergedLedger),
  );
  const missingSourceIds: string[] = getMissingSetValues(
    extractSourceIds(originalLedger),
    extractSourceIds(mergedLedger),
  );
  return {
    missingEvidenceIds,
    missingEvidenceTypes,
    missingNumbers,
    missingSourceIds,
    passed:
      missingEvidenceIds.length === 0 &&
      missingEvidenceTypes.length === 0 &&
      missingNumbers.length === 0 &&
      missingSourceIds.length === 0,
  };
}

function calculateNumberCoverage(
  sourceNumbers: Set<string>,
  note: string,
): number {
  if (sourceNumbers.size === 0) return 1;
  const noteNumbers: Set<string> = extractSignificantNumbers(note);
  const coveredCount: number = [...sourceNumbers].filter(
    (value: string): boolean => noteNumbers.has(value),
  ).length;
  return coveredCount / sourceNumbers.size;
}

function getMinimumNoteLength(
  sourceLength: number,
  noteStyle: NoteStyle,
  evidenceLedger?: string,
): number {
  const evidenceLength: number = evidenceLedger
    ? getEvidenceInformationLength(evidenceLedger)
    : 0;
  if (evidenceLength > 0) {
    return noteStyle === 'meeting'
      ? clamp(Math.floor(evidenceLength * 0.65), 220, 10_000)
      : clamp(
          Math.floor(Math.min(evidenceLength * 0.9, sourceLength * 0.4)),
          300,
          20_000,
        );
  }
  return noteStyle === 'meeting'
    ? clamp(Math.floor(sourceLength * 0.08), 220, 4_000)
    : clamp(Math.floor(sourceLength * 0.12), 300, 8_000);
}

function hasTraceabilitySignal(note: string, noteStyle: NoteStyle): boolean {
  if (noteStyle === 'meeting') return note.includes('纪要状态：');
  return (
    /\[S\d+\]/u.test(note) ||
    /\[E-S\d+-\d+\]/u.test(note) ||
    note.includes('转写原话') ||
    note.includes('【待人工确认】') ||
    /^>\s+/mu.test(note)
  );
}

function hasOverlongParagraph(note: string): boolean {
  let proseParagraph = '';
  const flushProseParagraph = (): boolean => {
    const overlong: boolean = proseParagraph.trim().length > 600;
    proseParagraph = '';
    return overlong;
  };
  let insideCodeFence = false;

  for (const line of note.split('\n')) {
    const trimmed: string = line.trim();
    if (trimmed.startsWith('```')) {
      if (flushProseParagraph()) return true;
      insideCodeFence = !insideCodeFence;
      continue;
    }
    if (insideCodeFence) continue;

    const isStructuralLine: boolean =
      !trimmed ||
      /^#{1,6}\s/u.test(trimmed) ||
      /^>\s?/u.test(trimmed) ||
      /^\|/u.test(trimmed) ||
      /^(?:[-+*]|\d+[.)])\s+/u.test(trimmed);
    if (isStructuralLine) {
      if (flushProseParagraph()) return true;
      const listItemContent: string = trimmed.replace(
        /^(?:[-+*]|\d+[.)])\s+/u,
        '',
      );
      if (listItemContent !== trimmed && listItemContent.length > 600) {
        return true;
      }
      continue;
    }

    proseParagraph = proseParagraph ? `${proseParagraph}\n${trimmed}` : trimmed;
  }
  return flushProseParagraph();
}

export function splitSourceText(
  sourceText: string,
  maxChunkCharacters = 12_000,
): SourceTextChunk[] {
  if (maxChunkCharacters < 1) {
    throw new Error('分块字符数必须大于 0');
  }
  if (!sourceText) return [];

  const chunks: SourceTextChunk[] = [];
  let startOffset = 0;
  while (startOffset < sourceText.length) {
    let endOffset: number = Math.min(
      sourceText.length,
      startOffset + maxChunkCharacters,
    );
    if (endOffset < sourceText.length) {
      const segment: string = sourceText.slice(startOffset, endOffset);
      const paragraphBreak: number = segment.lastIndexOf('\n\n');
      const lineBreak: number = segment.lastIndexOf('\n');
      const preferredBreak: number =
        paragraphBreak >= Math.floor(maxChunkCharacters * 0.5)
          ? paragraphBreak
          : lineBreak >= Math.floor(maxChunkCharacters * 0.7)
            ? lineBreak
            : -1;
      if (preferredBreak > 0) endOffset = startOffset + preferredBreak;
    }
    chunks.push({
      content: sourceText.slice(startOffset, endOffset),
      endOffset,
      index: chunks.length + 1,
      startOffset,
    });
    startOffset = endOffset;
  }
  return chunks;
}

export function buildEvidenceExtractionPrompt(
  chunk: SourceTextChunk,
  totalChunks: number,
): string {
  const sourceId: string = `S${String(chunk.index).padStart(2, '0')}`;
  return `你是高精度内容提取员。请把下面第 ${chunk.index}/${totalChunks} 个原文分块整理为“证据账本”，不要写总结文章。

${PIPELINE_TRUTHFULNESS_RULES}

提取规则：
1. 逐段提取所有与主题、操作或项目判断有关的信息，不做“只挑最重要内容”的筛选；不因重复措辞而丢失新增条件。
2. 所有影响范围、成本、进度、性能、阈值、版本、结果或决策的数字、价格、日期、人数、工期、比例和参数必须单独保留为“数字”证据。
3. 完整保留事实、数字、原话、案例、步骤、风险、限制、术语、关系、对比、观点、结论、建议、待办、分歧和待研究问题。
4. 值得引用的表达写为“转写原话”，保留原有说话人和时间戳；没有说话人时不要虚构。
5. 输出严格 JSON Lines，每行一个 JSON 对象，不要使用 Markdown 代码围栏。id 从 E-${sourceId}-001 开始递增且不得重复；sourceId 固定为 ${sourceId}；type 只能从事实、数字、原话、案例、步骤、风险、限制、术语、关系、对比、观点、结论、建议、待办、分歧、待研究中选择。
6. 相同事实可以合并，但不同数字、条件、例外、观点归属不得合并。
7. 疑似转写错误的专有名词保留原始写法并标记【待人工确认】，不得自行纠正后当作事实。
8. certainty 只能是 direct、inferred、uncertain；asrRisk 只能是 low、medium、high。原文直接陈述用 direct；编辑推断不得作为事实，确需保留时用 inferred；发言人记忆模糊或转写不可靠时用 uncertain。
9. 数字证据必须填写 numericClaims。每个 numericClaims 元素包含 subject、value、operator；operator 只能是 eq、gte、lte、gt、lt、increase、decrease、range。能确认时填写 unit、relatedValue、qualifier。尤其不得把“以上”写成“以下”，不得混淆平台用户、客户总用户等不同主体。
10. 不输出开场白、评价或原文之外的解释。

单行格式示例：
{"id":"E-${sourceId}-001","sourceId":"${sourceId}","type":"数字","statement":"知识图谱在 3.5 以上模型版本中可能无法生成。","timestamp":"99:07","speaker":"发言人1","certainty":"direct","asrRisk":"low","numericClaims":[{"subject":"知识图谱模型版本","value":"3.5","unit":"版本","operator":"gte"}]}

原文分块 [${sourceId}]：
---BEGIN SOURCE---
${chunk.content}
---END SOURCE---`;
}

export function buildEvidenceGapAuditPrompt(
  chunk: SourceTextChunk,
  evidenceLedger: string,
): string {
  const sourceId: string = `S${String(chunk.index).padStart(2, '0')}`;
  return `你是独立证据缺口审计员。请逐句比较原文分块和现有证据账本，只找出账本真正遗漏的信息，不要重写已有证据。

${PIPELINE_TRUTHFULNESS_RULES}

审计规则：
1. 检查每个独有事实、数字、原话、案例、步骤、风险、限制、术语、关系、对比、观点、结论、建议、待办、分歧和待研究问题是否已经进入账本。
2. 特别检查小功能、操作细节、产品边界、Bug、数字主体、单位、以上/以下、增加/减少、模糊表达和说话人不确定性。
3. 只输出真正遗漏的证据，不得重复、改写或扩展账本已有内容，不得补充原文外信息。
4. 有遗漏时输出严格 JSON Lines，每行一个对象；字段与提取阶段一致。id 使用 E-${sourceId}-900 起的临时编号，sourceId 固定为 ${sourceId}。系统会在合并后重新编号。
5. 数字证据必须包含 numericClaims，保留 subject、value、unit、operator、relatedValue 和 qualifier 中原文能够确认的字段。
6. 每条遗漏证据都必须填写 quote，逐字复制能够支持该条 statement 的最短原文片段；系统会验证 quote 确实存在于当前原文分块。不得把概括改写放入 quote。
7. 不确定内容使用 certainty=uncertain；疑似转写错误设置 asrRisk=high 并在 statement 中标记【待人工确认】。
8. 确认没有任何遗漏时，只输出 ${NO_MISSING_EVIDENCE_MARKER}，不得输出解释、代码围栏或其他文字。

原文分块 [${sourceId}]：
---BEGIN SOURCE CHUNK---
${chunk.content}
---END SOURCE CHUNK---

现有证据账本：
---BEGIN CURRENT EVIDENCE LEDGER---
${evidenceLedger}
---END CURRENT EVIDENCE LEDGER---`;
}

export function buildEvidenceMergePrompt(evidenceLedger: string): string {
  return `你是证据账本合并员。请去除完全重复的证据并统一同义术语，但不得压缩掉任何独有信息。

合并红线：
1. 不得删除任何唯一数字、单位、日期、版本号、人名、产品名、条件、例外或观点归属。
2. 不得删除独有的案例、步骤、风险、限制、原话、关系、对比、观点、结论、建议、待办、分歧或待研究问题。
3. 保留每行 JSON 的 id、sourceId、type、certainty、asrRisk、numericClaims 等结构化字段；任何 E-S01-001 等证据 ID 都不得删除或改写。兼容旧账本时必须保留 [S01] 等全部来源标记。
4. 冲突信息不得擅自裁决，应并列保留并标记【存在冲突，待人工确认】。
5. 不得补充账本之外的解释或常识。
6. 继续使用严格 JSON Lines，每行一个证据对象，不输出代码围栏或说明。

待合并账本：
---BEGIN EVIDENCE LEDGER---
${evidenceLedger}
---END EVIDENCE LEDGER---`;
}

export function buildEvidenceCoveragePlanPrompt(
  input: EvidenceCoveragePlanPromptInput,
): string {
  const structure: string =
    input.noteStyle === 'meeting'
      ? '只规划“会议议程、会议内容、会后待办”三个一级内容模块。'
      : '规划详细主笔记、证据驱动专题模块，并把“一页复习”放在所有详细内容之后。';
  return `你是笔记证据覆盖规划员。请先规划信息放置位置，不要直接写最终笔记。

${PIPELINE_TRUTHFULNESS_RULES}

资料标题：${input.sourceTitle}
笔记类型：${input.noteStyle === 'meeting' ? '会议纪要' : '学习/培训笔记'}
${structure}

规划规则：
1. 证据账本中的每条证据都必须在计划中出现，使用原始 [E-S01-001] 证据 ID 标记；不得静默省略。
2. 同一证据可以同时服务于详细正文和一页复习，但详细正文必须是第一落点。
3. 数字必须与主体、单位、限定词和比较方向一起规划；案例必须规划背景、问题、处理、结果或启示。
4. 原话、操作细节、小Bug、功能边界和项目成本不能因“不是核心结论”而删除。
5. uncertain 或 high ASR 风险证据进入“待人工确认”或相应正文，不得改写为确定事实。
6. 输出 Markdown 章节大纲；每个条目写“[证据ID] + 要保留的具体信息”，不输出正文。

用户输出偏好：
---BEGIN USER REQUIREMENTS---
${input.styleRequirements}
---END USER REQUIREMENTS---

证据账本：
---BEGIN EVIDENCE LEDGER---
${input.evidenceLedger}
---END EVIDENCE LEDGER---`;
}

export function buildNoteStructurePrompt(
  input: NoteStructurePromptInput,
): string {
  const structureContract: string =
    input.noteStyle === 'meeting'
      ? `输出必须遵守会议纪要固定结构，只允许三个一级内容模块：
## 一、会议议程
## 二、会议内容
## 三、会后待办

“会议内容”按议题组织背景、事实、观点、建议、分歧和会议结论；不得抬高确定性。
“会后待办”使用表格，至少包含待办事项、负责人、截止时间、输出结果、依赖。未明确的信息写“待确认”。
正文末尾增加“纪要状态：”，如实统计未形成结论的议题和信息不完整的待办。
证据中出现的每个议题、事实、数字、观点、建议、分歧、风险、限制、结论和待办都必须在固定三段内找到对应位置，不得以“纪要应简洁”为由省略。`
      : `学习笔记不强制固定十章，但必须延续平台已发布的学习/培训笔记结构，不得改用其他笔记类型的结构：
# 标题
## 一、内容概览
## 二、核心结论与关键要点
## 三、核心知识体系
## 四、一页复习

详细主笔记必须完整承载证据；“一页复习”只负责二次压缩，不能替代主笔记中的事实、案例和论证。
方法流程、知识关系、案例、对比、关键数据、风险误区、关键术语、待研究问题采用证据驱动规则：证据账本只要出现对应类型，就必须输出对应独立模块并覆盖该类型全部独有信息；没有对应证据时才省略。
优先保证事实密度、因果链、条件、数字、案例和可复习性，不为了字数扩写，也不为了避免重复而删除必要上下文。`;

  const coveragePlan: string = input.coveragePlan?.trim()
    ? `\n证据覆盖计划（必须逐项落实，不得只复制证据ID）：\n---BEGIN COVERAGE PLAN---\n${input.coveragePlan}\n---END COVERAGE PLAN---\n`
    : '';
  return `你是高级中文知识管理编辑。请根据证据账本生成可直接交付的 Markdown 笔记。

${PIPELINE_TRUTHFULNESS_RULES}

资料标题：${input.sourceTitle}

${structureContract}

共同写作要求：
1. 先逐类核对证据账本，再写详细主笔记；账本中每行独有的事实、数字、案例、步骤、风险、限制、关系、对比、观点、结论、建议、待办、分歧、术语或待研究问题都必须被正文承载。
2. 数字必须保留语义和单位；重要数字集中进入数据表，但不要只存在于数据表。
3. 风险必须说明表现、影响和原文给出的应对；原文没有应对时写“原文未给出应对方案”。
4. 案例按背景、问题、处理、结果或启示整理，缺失字段如实省略。
5. 可以基于证据做关系梳理、因果归纳和跨段总结，但必须标为“整理归纳”，并与原文事实、转写原话和编辑建议区分，不能把归纳写成原文结论。
6. 账本提供 [E-S01-001] 时，在对应正文后就近标注该证据 ID；账本使用 [S01][类型] 原句时，在对应段落就近标注 [S01]。不得集中堆放标记，也不要求每句话重复同一来源。
7. 用户可以调整排版、语气和章节命名，但不能要求短摘要来降低事实覆盖，也不能删除系统要求的证据类型。
8. 标题反映信息内容，段落简洁；允许核心结论与专题模块互相引用，但不得机械复制整段。
9. 重点标记克制使用：🔴风险、🔵关键知识、🟠条件或待确认；不以数量充当质量。
10. 只输出完整 Markdown 笔记，不输出分析过程、评分或致歉。

用户的输出偏好（不得突破真实性红线和结构契约）：
---BEGIN USER REQUIREMENTS---
${input.styleRequirements}
---END USER REQUIREMENTS---
${coveragePlan}

证据账本：
---BEGIN EVIDENCE LEDGER---
${input.evidenceLedger}
---END EVIDENCE LEDGER---`;
}

export function buildNoteRepairPrompt(input: NoteRepairPromptInput): string {
  const failedChecks: string = input.failedChecks
    .map((check: string, index: number): string => `${index + 1}. ${check}`)
    .join('\n');
  const structureRepairRules: string =
    input.noteStyle === 'meeting'
      ? `3. 严格保持“会议议程、会议内容、会后待办”三个一级内容模块。
4. 不得加入学习笔记的知识体系、复习或研究问题等结构；证据中的分歧、风险、限制、建议和结论必须在“会议内容”内逐项补齐。`
      : `3. 保留原学习/培训笔记的“标题＋内容概览＋核心结论或关键要点＋核心知识体系＋一页复习”结构。
4. 证据账本出现关系、步骤、案例、对比、数字、风险或限制、术语、待研究类型时，必须保留对应独立模块，不得把它们视为可选内容。`;
  return `你是笔记质量修订员。请修复下列明确问题，并输出修订后的完整 Markdown。

${PIPELINE_TRUTHFULNESS_RULES}

资料标题：${input.sourceTitle}
笔记类型：${input.noteStyle === 'meeting' ? '会议纪要' : '学习/培训笔记'}

必须修复的问题：
${failedChecks}

修订规则：
1. 只使用证据账本，不得为了通过门禁补造数字、引用、案例、负责人或截止时间。
2. 保留草稿中已正确、有证据的信息；本轮以增补为主，不得把正确的详细内容改写成更短摘要。只删除确有重复或无依据的内容。
${structureRepairRules}
5. 逐类核对事实、数字、原话、案例、步骤、风险、限制、术语、关系、对比、观点、结论、建议、待办、分歧和待研究证据；明确问题中指出缺失的类别必须补齐全部独有条目，而不是只补一个示例或空标题。
6. 账本提供 [E-S01-001] 时保留并补齐证据 ID；账本使用 [S01][类型] 原句时，在对应段落就近使用 [S01] 来源标记，不得集中堆放。
7. 若用户输出偏好中给出有效正文目标区间，修订稿必须尽量达到下限；只能用尚未展开的证据补足，禁止重复凑字数。
8. 输出修订后的完整 Markdown，不输出评分、修改说明或分析过程。

用户输出偏好：
---BEGIN USER REQUIREMENTS---
${input.styleRequirements}
---END USER REQUIREMENTS---

证据账本：
---BEGIN EVIDENCE LEDGER---
${input.evidenceLedger}
---END EVIDENCE LEDGER---

当前草稿：
---BEGIN DRAFT---
${input.draftNote}
---END DRAFT---`;
}

export function buildNoteFactAuditPrompt(
  input: NoteFactAuditPromptInput,
): string {
  return `你是独立事实审校员。不要润色文章，只比较证据账本与草稿并输出机器可读审校结果。

${PIPELINE_TRUTHFULNESS_RULES}

资料标题：${input.sourceTitle}
笔记类型：${input.noteStyle === 'meeting' ? '会议纪要' : '学习/培训笔记'}

审校要求：
1. 检查每个证据ID是否在承载其真实内容的句段后出现；仅罗列ID但没有内容仍算遗漏。
2. 逐项核对主体、数值、单位、比较方向、限定词、时间顺序、因果关系和观点归属。
3. 特别检查以上/以下、增加/减少、平台用户/客户总用户、原始值/调整后值等语义翻转。
4. 检查草稿是否增加了证据账本不存在的案例、事实、数字或确定结论。
5. uncertain、inferred 或 high ASR 风险内容如果未标记待确认，计入 ambiguityIssues。
6. 只输出一个 JSON 对象，不要使用 Markdown 代码围栏。结构必须是：
{"passed":true,"missingEvidenceIds":[],"contradictions":[],"unsupportedClaims":[],"ambiguityIssues":[]}
7. contradictions 和 ambiguityIssues 的元素格式为 {"evidenceId":"可选","message":"具体问题"}；unsupportedClaims 为草稿中的无来源表述字符串。

证据账本：
---BEGIN EVIDENCE LEDGER---
${input.evidenceLedger}
---END EVIDENCE LEDGER---

待审校草稿：
---BEGIN DRAFT---
${input.draftNote}
---END DRAFT---`;
}

function parseFactAuditIssues(value: unknown): FactAuditIssue[] {
  if (!Array.isArray(value)) return [];
  const issues: FactAuditIssue[] = [];
  for (const item of value) {
    if (typeof item === 'string' && item.trim()) {
      issues.push({ message: item.trim() });
      continue;
    }
    if (!isObject(item)) continue;
    const message: string | undefined = getRequiredString(item, 'message');
    if (!message) continue;
    issues.push({
      evidenceId: getRequiredString(item, 'evidenceId'),
      message,
    });
  }
  return issues;
}

function parseStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter(
        (item: unknown): item is string =>
          typeof item === 'string' && Boolean(item.trim()),
      )
    : [];
}

export function parseNoteFactAudit(rawAudit: string): NoteFactAudit {
  const startIndex: number = rawAudit.indexOf('{');
  const endIndex: number = rawAudit.lastIndexOf('}');
  if (startIndex < 0 || endIndex <= startIndex) {
    return {
      ambiguityIssues: [{ message: '事实审校结果无法解析为 JSON' }],
      contradictions: [],
      missingEvidenceIds: [],
      passed: false,
      unsupportedClaims: [],
    };
  }
  try {
    const value: unknown = JSON.parse(rawAudit.slice(startIndex, endIndex + 1));
    if (!isObject(value)) throw new Error('审校结果不是对象');
    const ambiguityIssues: FactAuditIssue[] = parseFactAuditIssues(
      value.ambiguityIssues,
    );
    const contradictions: FactAuditIssue[] = parseFactAuditIssues(
      value.contradictions,
    );
    const missingEvidenceIds: string[] = parseStringArray(
      value.missingEvidenceIds,
    );
    const unsupportedClaims: string[] = parseStringArray(
      value.unsupportedClaims,
    );
    const hasIssues: boolean =
      ambiguityIssues.length > 0 ||
      contradictions.length > 0 ||
      missingEvidenceIds.length > 0 ||
      unsupportedClaims.length > 0;
    return {
      ambiguityIssues,
      contradictions,
      missingEvidenceIds,
      passed: value.passed === true && !hasIssues,
      unsupportedClaims,
    };
  } catch {
    return {
      ambiguityIssues: [{ message: '事实审校结果无法解析为 JSON' }],
      contradictions: [],
      missingEvidenceIds: [],
      passed: false,
      unsupportedClaims: [],
    };
  }
}

export function formatFactAuditFailures(audit: NoteFactAudit): string[] {
  const failures: string[] = [];
  if (audit.missingEvidenceIds.length > 0) {
    failures.push(
      `事实审校发现遗漏证据：${audit.missingEvidenceIds.join('、')}`,
    );
  }
  for (const issue of audit.contradictions) {
    failures.push(
      `事实矛盾${issue.evidenceId ? `（${issue.evidenceId}）` : ''}：${issue.message}`,
    );
  }
  for (const claim of audit.unsupportedClaims) {
    failures.push(`无来源新增事实：${claim}`);
  }
  for (const issue of audit.ambiguityIssues) {
    failures.push(
      `不确定性处理错误${issue.evidenceId ? `（${issue.evidenceId}）` : ''}：${issue.message}`,
    );
  }
  return failures;
}

export function normalizeEvidenceCitationsForPublication(
  note: string,
  evidenceLedger: string,
): string {
  let published: string = note;
  const records: EvidenceRecord[] = parseEvidenceLedger(evidenceLedger);
  for (const record of records) {
    if (!record.id.startsWith('E-')) continue;
    published = published.split(`[${record.id}]`).join(`[${record.sourceId}]`);
  }
  if (!records.some((record: EvidenceRecord): boolean => record.id.startsWith('E-'))) {
    published = published.replace(/\[E-(S\d+)-\d+\]/gu, '[$1]');
  }
  let previous: string;
  do {
    previous = published;
    published = published.replace(/(\[S\d+\])\1/gu, '$1');
  } while (published !== previous);
  return published;
}

interface SourceMarkdownImage {
  alt: string;
  markdown: string;
  url: string;
}

function extractSourceMarkdownImages(markdown: string): SourceMarkdownImage[] {
  const images: SourceMarkdownImage[] = [];
  for (const rawLine of markdown.split('\n')) {
    const line: string = rawLine.trim();
    const match: RegExpMatchArray | null = line.match(
      /^!\[([^\]]*)\]\(([^)]+)\)$/u,
    );
    const url: string | undefined = match?.[2]?.trim();
    if (!match || !url) continue;
    images.push({ alt: match[1]?.trim() || '', markdown: line, url });
  }
  return images;
}

function extractVisualSemanticTokens(text: string): Set<string> {
  const tokens: Set<string> = new Set<string>();
  for (const match of text
    .toLowerCase()
    .matchAll(/[\p{Script=Han}]+|[a-z0-9]+/gu)) {
    const value: string | undefined = match[0];
    if (!value) continue;
    if (/^[a-z0-9]+$/u.test(value)) {
      if (value.length >= 2) tokens.add(value);
      continue;
    }
    for (let index = 0; index < value.length - 1; index += 1) {
      tokens.add(value.slice(index, index + 2));
    }
  }
  return tokens;
}

export function preserveSourceMarkdownImages(
  note: string,
  sourceText: string,
): string {
  const missingImages: SourceMarkdownImage[] = extractSourceMarkdownImages(
    sourceText,
  ).filter((image: SourceMarkdownImage): boolean => !note.includes(image.url));
  if (missingImages.length === 0) return note;

  const lines: string[] = note.split('\n');
  const sectionStarts: number[] = lines
    .map((line: string, index: number): number =>
      /^##\s+/u.test(line) ? index : -1,
    )
    .filter((index: number): boolean => index >= 0);
  const imagesBySection: Map<number, SourceMarkdownImage[]> = new Map();
  const unmatchedImages: SourceMarkdownImage[] = [];

  for (const image of missingImages) {
    const imageTokens: Set<string> = extractVisualSemanticTokens(image.alt);
    let bestSectionLine: number | undefined;
    let bestScore = 0;
    for (let index = 0; index < sectionStarts.length; index += 1) {
      const startLine: number = sectionStarts[index];
      const endLine: number = sectionStarts[index + 1] ?? lines.length;
      const sectionTokens: Set<string> = extractVisualSemanticTokens(
        lines.slice(startLine, endLine).join(' '),
      );
      const score: number = [...imageTokens].filter((token: string): boolean =>
        sectionTokens.has(token),
      ).length;
      if (score > bestScore) {
        bestScore = score;
        bestSectionLine = startLine;
      }
    }
    if (bestSectionLine !== undefined && bestScore >= 2) {
      const sectionImages: SourceMarkdownImage[] =
        imagesBySection.get(bestSectionLine) || [];
      sectionImages.push(image);
      imagesBySection.set(bestSectionLine, sectionImages);
    } else {
      unmatchedImages.push(image);
    }
  }

  for (const [sectionLine, images] of [...imagesBySection.entries()].sort(
    (
      [left]: [number, SourceMarkdownImage[]],
      [right]: [number, SourceMarkdownImage[]],
    ): number => right - left,
  )) {
    lines.splice(
      sectionLine + 1,
      0,
      '',
      ...images.flatMap((image: SourceMarkdownImage): string[] => [
        image.markdown,
        '',
      ]),
    );
  }
  if (unmatchedImages.length > 0) {
    const reviewLine: number = lines.findIndex((line: string): boolean =>
      /^##\s+.*一页复习/u.test(line),
    );
    const insertLine: number = reviewLine >= 0 ? reviewLine : lines.length;
    lines.splice(
      insertLine,
      0,
      '## 原始资料图片',
      '',
      ...unmatchedImages.flatMap((image: SourceMarkdownImage): string[] => [
        image.markdown,
        '',
      ]),
    );
  }
  return lines.join('\n');
}

export function assessNoteQuality(
  input: NoteQualityInput,
): NoteQualityAssessment {
  const missingSections: string[] = getMissingSections(
    input.note,
    input.noteStyle,
  );
  const unexpectedSections: string[] =
    input.noteStyle === 'meeting'
      ? getUnexpectedMeetingSections(input.note)
      : [];
  const evidenceLedger: string = input.evidenceLedger || '';
  const evidenceRequirements: EvidenceCoverageRequirement[] =
    getActiveEvidenceRequirements(evidenceLedger, input.noteStyle);
  const missingEvidenceCoverage: string[] = getMissingEvidenceCoverage(
    input.note,
    input.noteStyle,
    evidenceRequirements,
  );
  const evidenceCoverage: number =
    evidenceRequirements.length === 0
      ? 1
      : (evidenceRequirements.length - missingEvidenceCoverage.length) /
        evidenceRequirements.length;
  const expectedSourceIds: Set<string> = extractSourceIds(evidenceLedger);
  const missingSourceIds: string[] = getMissingSourceIds(
    input.note,
    evidenceLedger,
  );
  const sourceAnchorCoverage: number =
    expectedSourceIds.size === 0
      ? 1
      : (expectedSourceIds.size - missingSourceIds.length) /
        expectedSourceIds.size;
  const expectedEvidenceIds: Set<string> =
    extractExplicitEvidenceIds(evidenceLedger);
  const missingEvidenceIds: string[] = getMissingEvidenceIds(
    input.note,
    evidenceLedger,
  );
  const ungroundedEvidenceIds: string[] = getUngroundedEvidenceIds(
    input.note,
    evidenceLedger,
  );
  const evidenceItemCoverage: number =
    expectedEvidenceIds.size === 0
      ? 1
      : (expectedEvidenceIds.size - missingEvidenceIds.length) /
        expectedEvidenceIds.size;
  const citedEvidenceCount: number =
    expectedEvidenceIds.size - missingEvidenceIds.length;
  const evidenceGroundingCoverage: number =
    citedEvidenceCount === 0
      ? expectedEvidenceIds.size === 0
        ? 1
        : 0
      : (citedEvidenceCount - ungroundedEvidenceIds.length) /
        citedEvidenceCount;
  const semanticContradictions: string[] = getSemanticDirectionContradictions(
    input.note,
    evidenceLedger,
  );
  const sourceVisualUrls: Set<string> = new Set<string>(
    extractSourceMarkdownImages(input.sourceText).map(
      (image: SourceMarkdownImage): string => image.url,
    ),
  );
  const noteVisualUrls: Set<string> = new Set<string>(
    extractSourceMarkdownImages(input.note).map(
      (image: SourceMarkdownImage): string => image.url,
    ),
  );
  const missingVisualUrls: string[] = [...sourceVisualUrls].filter(
    (url: string): boolean => !noteVisualUrls.has(url),
  );
  const visualCoverage: number =
    sourceVisualUrls.size === 0
      ? 1
      : (sourceVisualUrls.size - missingVisualUrls.length) /
        sourceVisualUrls.size;
  const sourceNumbers: Set<string> = input.evidenceLedger
    ? extractEvidenceLedgerNumbers(evidenceLedger)
    : extractSignificantNumbers(input.sourceText);
  const numberCoverage: number = calculateNumberCoverage(
    sourceNumbers,
    input.note,
  );
  const minimumLength: number = getMinimumNoteLength(
    input.sourceText.trim().length,
    input.noteStyle,
    evidenceLedger,
  );
  const noteLength: number = input.note.trim().length;
  const traceable: boolean = hasTraceabilitySignal(input.note, input.noteStyle);
  const overlongParagraph: boolean = hasOverlongParagraph(input.note);
  const requiredSectionCount: number =
    input.noteStyle === 'meeting'
      ? MEETING_REQUIRED_SECTIONS.length
      : LEARNING_REQUIRED_SECTIONS.length + 1;
  const structurePoints: number =
    ((requiredSectionCount - missingSections.length) / requiredSectionCount) *
    40;
  const numberPoints: number = numberCoverage * 25;
  const densityPoints: number = Math.min(1, noteLength / minimumLength) * 15;
  const traceabilityPoints: number = traceable ? 10 : 0;
  const stylePoints: number = overlongParagraph ? 5 : 10;
  const coveragePenalty: number =
    (1 - evidenceCoverage) * 20 +
    (1 - sourceAnchorCoverage) * 10 +
    (1 - evidenceItemCoverage) * 25 +
    (1 - evidenceGroundingCoverage) * 20 +
    (1 - visualCoverage) * 20 +
    Math.min(30, semanticContradictions.length * 15);
  const score: number = Math.round(
    Math.max(
      0,
      Math.min(
        100,
        structurePoints +
          numberPoints +
          densityPoints +
          traceabilityPoints +
          stylePoints -
          coveragePenalty,
      ),
    ),
  );
  const failedChecks: string[] = missingSections.map(
    (section: string): string => `缺少“${section}”核心模块`,
  );
  if (unexpectedSections.length > 0) {
    failedChecks.push(
      `会议纪要出现额外一级模块：${unexpectedSections.join('、')}；请合并到固定三段结构中`,
    );
  }
  for (const missingCoverage of missingEvidenceCoverage) {
    failedChecks.push(
      input.noteStyle === 'meeting'
        ? `会议证据包含“${missingCoverage}”，但固定三段内未明确保留`
        : `证据账本包含“${missingCoverage}”相关信息，但正文缺少对应覆盖`,
    );
  }
  if (missingSourceIds.length > 0) {
    failedChecks.push(
      `缺少来源分块标记：${missingSourceIds.join('、')}；需要补回这些分块中的独有信息并就近标注来源`,
    );
  }
  if (missingEvidenceIds.length > 0) {
    failedChecks.push(
      `缺少结构化证据条目：${missingEvidenceIds.join('、')}；需要在承载其真实内容的句段后就近标注对应证据ID`,
    );
  }
  if (ungroundedEvidenceIds.length > 0) {
    failedChecks.push(
      `证据引用未承载对应事实：${ungroundedEvidenceIds.join('、')}；必须把证据ID放在与其原始陈述语义和数字匹配的句段后，不能集中堆放或挂在无关内容上`,
    );
  }
  for (const contradiction of semanticContradictions) {
    failedChecks.push(`数字语义或比较方向错误：${contradiction}`);
  }
  if (missingVisualUrls.length > 0) {
    failedChecks.push(
      `遗漏原始资料图片：${missingVisualUrls.join('、')}；必须保留原图，不得生成替代图片冒充来源`,
    );
  }
  if (noteLength < minimumLength) {
    failedChecks.push(
      `有效正文约 ${noteLength} 字，低于基于证据账本信息量计算的 ${minimumLength} 字完整性下限`,
    );
  }
  if (sourceNumbers.size >= 3 && numberCoverage < 0.7) {
    failedChecks.push(
      `重要数字覆盖率仅 ${Math.round(numberCoverage * 100)}%，需要回看证据账本补齐上下文`,
    );
  }
  if (!traceable) {
    failedChecks.push(
      input.noteStyle === 'meeting'
        ? '缺少“纪要状态”声明'
        : '缺少转写原话、证据引用或待确认标记，内容可追溯性不足',
    );
  }
  if (overlongParagraph) {
    failedChecks.push('存在超过 600 字的长段落，需要按观点或步骤拆分');
  }

  const hasHardFailure: boolean =
    missingSections.length > 0 ||
    unexpectedSections.length > 0 ||
    missingEvidenceCoverage.length > 0 ||
    missingSourceIds.length > 0 ||
    missingEvidenceIds.length > 0 ||
    ungroundedEvidenceIds.length > 0 ||
    semanticContradictions.length > 0 ||
    missingVisualUrls.length > 0 ||
    (sourceNumbers.size >= 3 && numberCoverage < 0.7) ||
    (evidenceLedger.trim().length >= 1_000 && noteLength < minimumLength) ||
    !traceable;
  return {
    evidenceCoverage,
    evidenceGroundingCoverage,
    evidenceItemCoverage,
    failedChecks,
    minimumLength,
    missingEvidenceCoverage,
    missingEvidenceIds,
    missingSections,
    missingSourceIds,
    missingVisualUrls,
    noteLength,
    numberCoverage,
    passed: !hasHardFailure && score >= 80,
    semanticContradictions,
    score,
    sourceAnchorCoverage,
    sourceNumberCount: sourceNumbers.size,
    unexpectedSections,
    ungroundedEvidenceIds,
    visualCoverage,
  };
}
