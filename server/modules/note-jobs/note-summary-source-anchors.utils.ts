import {
  parseEvidenceLedger,
  type EvidenceRecord,
  type EvidenceType,
  type NumericClaimOperator,
  type NumericEvidenceClaim,
} from './note-summary-pipeline.utils';

interface SourceAnchorChunk {
  content: string;
  index: number;
}

interface SourceLineMetadata {
  content: string;
  speaker?: string;
  timestamp?: string;
}

const NUMERIC_SIGNAL_PATTERN: RegExp =
  /\d+(?:[,.]+\d+)*(?:[%％])?|第[一二三四五六七八九十百\d]+|[两三四五六七八九十百千万]+(?:个|名|条|种|项|次|页|天|周|月|年)/u;
const NUMERIC_VALUE_PATTERN: RegExp = /\d+(?:[,.]+\d+)*(?:[%％])?/gu;
const RISK_SIGNAL_PATTERN: RegExp =
  /不能|无法|不支持|不可以|不会|没有|只能|仅限|限制|边界|风险|问题|异常|报错|失败|错误|不同步|没有跟着|性能|冲突|重复|注意|bug|待确认|不确定/iu;
const OPERATION_SIGNAL_PATTERN: RegExp =
  /点击|选择|配置|导入|导出|上传|新增|创建|调用|生成|调整|修改|开发|定位|同步|引用|填写|设置|切换|登录|发布|部署|测试|校准|搜索|检索|添加|删除|保存|提交|连接|执行|编排/u;
const CASE_SIGNAL_PATTERN: RegExp = /比如|例如|案例|项目|客户|场景/u;
const MAX_ANCHOR_CHARACTERS = 260;

function normalizeComparableText(value: string): string {
  return value.replace(/[\s“”"'`，。！？；、,:：.!?;（）()[\]{}]/gu, '');
}

function parseSourceLine(rawLine: string): SourceLineMetadata {
  const line: string = rawLine.trim();
  const match: RegExpMatchArray | null = line.match(
    /^\[(\d{1,3}:\d{2}(?::\d{2})?)\]\s*([^:：\n]{1,30})[:：]\s*(.+)$/u,
  );
  if (!match) return { content: line };
  return {
    content: match[3]?.trim() || '',
    speaker: match[2]?.trim(),
    timestamp: match[1]?.trim(),
  };
}

function splitLongSegment(segment: string): string[] {
  if (segment.length <= MAX_ANCHOR_CHARACTERS) return [segment];
  const clauses: string[] = segment
    .split(/(?<=[，,])/u)
    .map((clause: string): string => clause.trim())
    .filter(Boolean);
  if (clauses.length <= 1) return [segment];

  const groups: string[] = [];
  let current = '';
  for (const clause of clauses) {
    if (current && current.length + clause.length > MAX_ANCHOR_CHARACTERS) {
      groups.push(current);
      current = clause;
      continue;
    }
    current += clause;
  }
  if (current) groups.push(current);
  return groups;
}

function splitSourceSegments(content: string): string[] {
  const sentences: string[] =
    content.match(/[^。！？!?；;\n]+[。！？!?；;]?/gu) || [];
  return sentences
    .flatMap((sentence: string): string[] => splitLongSegment(sentence.trim()))
    .map((sentence: string): string => sentence.trim())
    .filter(Boolean);
}

function hasHighValueSignal(segment: string): boolean {
  if (NUMERIC_SIGNAL_PATTERN.test(segment)) return true;
  if (RISK_SIGNAL_PATTERN.test(segment)) return true;
  if (OPERATION_SIGNAL_PATTERN.test(segment)) return true;
  return segment.length >= 14 && CASE_SIGNAL_PATTERN.test(segment);
}

function getNumericOperator(
  segment: string,
  valueIndex: number,
  valueLength: number,
): NumericClaimOperator {
  const context: string = segment.slice(
    Math.max(0, valueIndex - 12),
    Math.min(segment.length, valueIndex + valueLength + 12),
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

function extractNumericClaims(segment: string): NumericEvidenceClaim[] {
  const claims: NumericEvidenceClaim[] = [];
  for (const match of segment.matchAll(NUMERIC_VALUE_PATTERN)) {
    const rawValue: string | undefined = match[0];
    const valueIndex: number | undefined = match.index;
    if (!rawValue || valueIndex === undefined) continue;
    const value: string = rawValue
      .replace(/,+/gu, '')
      .replace(/[.]+/gu, '.')
      .replace(/％/gu, '%');
    claims.push({
      operator: getNumericOperator(segment, valueIndex, rawValue.length),
      subject: segment,
      value,
    });
  }
  return claims;
}

function getEvidenceType(
  segment: string,
  numericClaims: NumericEvidenceClaim[],
): EvidenceType {
  if (numericClaims.length > 0 || NUMERIC_SIGNAL_PATTERN.test(segment)) {
    return '数字';
  }
  if (RISK_SIGNAL_PATTERN.test(segment)) return '风险';
  if (OPERATION_SIGNAL_PATTERN.test(segment)) return '步骤';
  if (CASE_SIGNAL_PATTERN.test(segment)) return '案例';
  return '原话';
}

export function extractHighValueSourceAnchors(
  sourceText: string,
  sourceId: string,
): EvidenceRecord[] {
  if (!/^S\d+$/u.test(sourceId)) throw new Error('原文锚点来源 ID 无效');
  const records: EvidenceRecord[] = [];
  const seenQuotes: Set<string> = new Set<string>();
  for (const rawLine of sourceText.split('\n')) {
    const metadata: SourceLineMetadata = parseSourceLine(rawLine);
    if (!metadata.content) continue;
    for (const segment of splitSourceSegments(metadata.content)) {
      const comparable: string = normalizeComparableText(segment);
      if (comparable.length < 6 || !hasHighValueSignal(segment)) continue;
      if (seenQuotes.has(comparable)) continue;
      seenQuotes.add(comparable);
      const numericClaims: NumericEvidenceClaim[] =
        extractNumericClaims(segment);
      records.push({
        asrRisk: metadata.timestamp || metadata.speaker ? 'medium' : 'low',
        certainty: 'direct',
        id: `E-${sourceId}-${String(700 + records.length).padStart(3, '0')}`,
        ...(numericClaims.length > 0 ? { numericClaims } : {}),
        quote: segment,
        sourceId,
        ...(metadata.speaker ? { speaker: metadata.speaker } : {}),
        statement: segment,
        ...(metadata.timestamp ? { timestamp: metadata.timestamp } : {}),
        type: getEvidenceType(segment, numericClaims),
      });
    }
  }
  return records;
}

export function augmentEvidenceLedgerWithSourceAnchors(
  evidenceLedger: string,
  chunk: SourceAnchorChunk,
): string {
  const sourceId: string = `S${String(chunk.index).padStart(2, '0')}`;
  const comparableLedger: string = normalizeComparableText(evidenceLedger);
  const missingAnchors: EvidenceRecord[] = extractHighValueSourceAnchors(
    chunk.content,
    sourceId,
  ).filter((record: EvidenceRecord): boolean => {
    const quote: string = record.quote || record.statement;
    return !comparableLedger.includes(normalizeComparableText(quote));
  });
  if (missingAnchors.length === 0) return evidenceLedger;
  const existingSourceRecords: EvidenceRecord[] = parseEvidenceLedger(
    evidenceLedger,
  ).filter((record: EvidenceRecord): boolean => record.sourceId === sourceId);
  const maximumExistingId: number = existingSourceRecords.reduce(
    (maximum: number, record: EvidenceRecord): number => {
      const match: RegExpMatchArray | null = record.id.match(/-(\d+)$/u);
      const value: number = match?.[1] ? Number(match[1]) : 0;
      return Math.max(maximum, value);
    },
    0,
  );
  const startingIndex: number = Math.max(
    existingSourceRecords.length,
    maximumExistingId,
  );
  const reidentifiedAnchors: EvidenceRecord[] = missingAnchors.map(
    (record: EvidenceRecord, index: number): EvidenceRecord => ({
      ...record,
      id: `E-${sourceId}-${String(startingIndex + index + 1).padStart(3, '0')}`,
    }),
  );
  return [
    evidenceLedger.trim(),
    ...reidentifiedAnchors.map((record: EvidenceRecord): string =>
      JSON.stringify(record),
    ),
  ]
    .filter(Boolean)
    .join('\n');
}
