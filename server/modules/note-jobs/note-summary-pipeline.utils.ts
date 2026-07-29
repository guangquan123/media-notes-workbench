import type { NoteStyle } from '@shared/api.interface';

interface NoteStructurePromptInput {
  evidenceLedger: string;
  noteStyle: NoteStyle;
  sourceTitle: string;
  styleRequirements: string;
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
  failedChecks: string[];
  minimumLength: number;
  missingEvidenceCoverage: string[];
  missingSections: string[];
  missingSourceIds: string[];
  noteLength: number;
  numberCoverage: number;
  passed: boolean;
  score: number;
  sourceAnchorCoverage: number;
  sourceNumberCount: number;
  unexpectedSections: string[];
}

export interface EvidenceMergeIntegrity {
  missingEvidenceTypes: string[];
  missingNumbers: string[];
  missingSourceIds: string[];
  passed: boolean;
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

function extractEvidenceTypes(evidenceLedger: string): Set<string> {
  const types: Set<string> = new Set<string>();
  for (const line of evidenceLedger.split('\n')) {
    const match: RegExpMatchArray | null = line.match(
      /^(?:\[S\d+\])+\[([^\]]+)\]/u,
    );
    const evidenceType: string | undefined = match?.[1]?.trim();
    if (evidenceType) types.add(evidenceType);
  }
  return types;
}

function extractSourceIds(text: string): Set<string> {
  const sourceIds: Set<string> = new Set<string>();
  for (const match of text.matchAll(/\[S\d+\]/gu)) {
    const sourceId: string | undefined = match[0];
    if (sourceId) sourceIds.add(sourceId);
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
  return [...expectedSourceIds].filter(
    (sourceId: string): boolean => !noteSourceIds.has(sourceId),
  );
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
  const numericEvidence: string = evidenceLedger
    .split('\n')
    .filter((line: string): boolean => /\]\[数字\]/u.test(line))
    .map((line: string): string =>
      line.replace(/^(?:\[S\d+\])+\[数字\]\s*/u, ''),
    )
    .join('\n');
  return extractSignificantNumbers(numericEvidence);
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
    missingEvidenceTypes,
    missingNumbers,
    missingSourceIds,
    passed:
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
  const evidenceLength: number = evidenceLedger?.trim().length || 0;
  if (evidenceLength > 0) {
    return noteStyle === 'meeting'
      ? clamp(Math.floor(evidenceLength * 0.4), 220, 8_000)
      : clamp(Math.floor(evidenceLength * 0.6), 300, 16_000);
  }
  return noteStyle === 'meeting'
    ? clamp(Math.floor(sourceLength * 0.08), 220, 4_000)
    : clamp(Math.floor(sourceLength * 0.12), 300, 8_000);
}

function hasTraceabilitySignal(note: string, noteStyle: NoteStyle): boolean {
  if (noteStyle === 'meeting') return note.includes('纪要状态：');
  return (
    /\[S\d+\]/u.test(note) ||
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
2. 所有影响范围、成本、进度、性能、阈值、版本、结果或决策的数字、价格、日期、人数、工期、比例和参数必须单独保留为[数字]证据。
3. 完整保留事实、数字、原话、案例、步骤、风险、限制、术语、关系、对比、观点、结论、建议、待办、分歧和待研究问题。
4. 值得引用的表达写为“转写原话”，保留原有说话人和时间戳；没有说话人时不要虚构。
5. 每条证据单独成行并以 [${sourceId}][类型] 开头；类型只能从事实、数字、原话、案例、步骤、风险、限制、术语、关系、对比、观点、结论、建议、待办、分歧、待研究中选择。
6. 相同事实可以合并，但不同数字、条件、例外、观点归属不得合并。
7. 疑似转写错误的专有名词保留原始写法并标记【待人工确认】，不得自行纠正后当作事实。
8. 不输出开场白、评价或原文之外的解释。

原文分块 [${sourceId}]：
---BEGIN SOURCE---
${chunk.content}
---END SOURCE---`;
}

export function buildEvidenceMergePrompt(evidenceLedger: string): string {
  return `你是证据账本合并员。请去除完全重复的证据并统一同义术语，但不得压缩掉任何独有信息。

合并红线：
1. 不得删除任何唯一数字、单位、日期、版本号、人名、产品名、条件、例外或观点归属。
2. 不得删除独有的案例、步骤、风险、限制、原话、关系、对比、观点、结论、建议、待办、分歧或待研究问题。
3. 保留 [S01] 等全部来源标记；多个来源共同支持同一条证据时并列标注。
4. 冲突信息不得擅自裁决，应并列保留并标记【存在冲突，待人工确认】。
5. 不得补充账本之外的解释或常识。
6. 只输出合并后的证据账本。

待合并账本：
---BEGIN EVIDENCE LEDGER---
${evidenceLedger}
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

  return `你是高级中文知识管理编辑。请根据证据账本生成可直接交付的 Markdown 笔记。

${PIPELINE_TRUTHFULNESS_RULES}

资料标题：${input.sourceTitle}

${structureContract}

共同写作要求：
1. 先逐类核对证据账本，再写详细主笔记；任何独有事实、数字、案例、步骤、风险、限制、关系、对比、观点、结论、建议、待办、分歧、术语或待研究问题都必须被正文承载。
2. 数字必须保留语义和单位；重要数字集中进入数据表，但不要只存在于数据表。
3. 风险必须说明表现、影响和原文给出的应对；原文没有应对时写“原文未给出应对方案”。
4. 案例按背景、问题、处理、结果或启示整理，缺失字段如实省略。
5. 可以基于证据做关系梳理、因果归纳和跨段总结，但必须标为“整理归纳”，并与原文事实、转写原话和编辑建议区分，不能把归纳写成原文结论。
6. 每个来源分块 [S01] 等至少在正文出现一次；重要结论、数字、案例和原话应就近保留来源标记，多来源共同支持时并列标注。
7. 用户可以调整排版、语气和章节命名，但不能要求短摘要来降低事实覆盖，也不能删除系统要求的证据类型。
8. 标题反映信息内容，段落简洁；允许核心结论与专题模块互相引用，但不得机械复制整段。
9. 重点标记克制使用：🔴风险、🔵关键知识、🟠条件或待确认；不以数量充当质量。
10. 只输出完整 Markdown 笔记，不输出分析过程、评分或致歉。

用户的输出偏好（不得突破真实性红线和结构契约）：
---BEGIN USER REQUIREMENTS---
${input.styleRequirements}
---END USER REQUIREMENTS---

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
2. 保留草稿中已正确、有证据的信息；删除重复和无依据内容。
${structureRepairRules}
5. 逐类核对事实、数字、原话、案例、步骤、风险、限制、术语、关系、对比、观点、结论、建议、待办、分歧和待研究证据；明确问题中指出缺失的类别必须补齐全部独有条目，而不是只补一个示例或空标题。
6. 保留并补齐 [S01] 等来源标记，确保每个证据来源分块至少出现一次。
7. 输出修订后的完整 Markdown，不输出评分、修改说明或分析过程。

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
    (1 - evidenceCoverage) * 20 + (1 - sourceAnchorCoverage) * 10;
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
    (sourceNumbers.size >= 3 && numberCoverage < 0.7) ||
    (evidenceLedger.trim().length >= 1_000 && noteLength < minimumLength) ||
    !traceable;
  return {
    evidenceCoverage,
    failedChecks,
    minimumLength,
    missingEvidenceCoverage,
    missingSections,
    missingSourceIds,
    noteLength,
    numberCoverage,
    passed: !hasHardFailure && score >= 80,
    score,
    sourceAnchorCoverage,
    sourceNumberCount: sourceNumbers.size,
    unexpectedSections,
  };
}
