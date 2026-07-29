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
  failedChecks: string[];
  minimumLength: number;
  missingSections: string[];
  noteLength: number;
  numberCoverage: number;
  passed: boolean;
  score: number;
  sourceNumberCount: number;
  unexpectedSections: string[];
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

function getMissingSections(note: string, noteStyle: NoteStyle): string[] {
  const headings: string[] = extractHeadings(note);
  const requiredSections =
    noteStyle === 'meeting'
      ? MEETING_REQUIRED_SECTIONS
      : LEARNING_REQUIRED_SECTIONS;
  return requiredSections
    .filter(
      (section): boolean =>
        !section.aliases.some((alias: string): boolean =>
          headings.some((heading: string): boolean =>
            heading.includes(normalizeHeading(alias)),
          ),
        ),
    )
    .map((section): string => section.label);
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
    const expected: boolean = expectedAliases.some(
      (alias: string): boolean => normalized.includes(alias),
    );
    if (!expected) sections.push(rawHeading.replace(/[*_`]/gu, '').trim());
  }
  return sections;
}

function extractSignificantNumbers(text: string): Set<string> {
  const values: Set<string> = new Set<string>();
  const contentWithoutLocations: string = text
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
): number {
  return noteStyle === 'meeting'
    ? clamp(Math.floor(sourceLength * 0.08), 220, 4_000)
    : clamp(Math.floor(sourceLength * 0.12), 300, 8_000);
}

function hasTraceabilitySignal(note: string, noteStyle: NoteStyle): boolean {
  if (noteStyle === 'meeting') return note.includes('纪要状态：');
  return (
    note.includes('转写原话') ||
    note.includes('【待人工确认】') ||
    /^>\s+/mu.test(note)
  );
}

function hasOverlongParagraph(note: string): boolean {
  return note
    .split(/\n\s*\n/gu)
    .some(
      (paragraph: string): boolean =>
        !paragraph.trimStart().startsWith('|') && paragraph.trim().length > 600,
    );
}

export function splitSourceText(
  sourceText: string,
  maxChunkCharacters = 18_000,
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
1. 逐段提取所有有价值的信息，不因重复措辞而丢失新增条件。
2. 所有数字、价格、日期、版本号、人数、工期、比例和参数必须保留。
3. 保留事实、观点、建议、结论、步骤、案例、风险、限制、术语、待研究问题。
4. 值得引用的表达写为“转写原话”，保留原有说话人和时间戳；没有说话人时不要虚构。
5. 每条证据以 [${sourceId}][类型] 开头；类型从事实、数字、原话、案例、步骤、风险、术语、结论、建议、待办、待研究中选择。
6. 相同事实可以合并，但不同数字、条件、例外、观点归属不得合并。
7. 不输出开场白、评价或原文之外的解释。

原文分块 [${sourceId}]：
---BEGIN SOURCE---
${chunk.content}
---END SOURCE---`;
}

export function buildEvidenceMergePrompt(evidenceLedger: string): string {
  return `你是证据账本合并员。请去除完全重复的证据并统一同义术语，但不得压缩掉任何独有信息。

合并红线：
1. 不得删除任何唯一数字、单位、日期、版本号、人名、产品名、条件、例外或观点归属。
2. 不得删除独有的案例、步骤、风险、限制、原话、结论、建议、待办或待研究问题。
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
正文末尾增加“纪要状态：”，如实统计未形成结论的议题和信息不完整的待办。`
      : `学习笔记不强制固定十章，但必须包含以下固定核心模块：
## 一、内容概览
## 二、核心结论与关键要点
## 三、核心知识体系
## 四、一页复习

方法流程、知识关系、案例、对比、关键数据、风险误区、关键术语、待研究问题属于自适应模块，必须按证据决定是否出现；有对应证据且能增加价值时输出，没有证据时省略。
优先保证事实密度、因果链、条件、数字、案例和可复习性，不为了字数扩写。`;

  return `你是高级中文知识管理编辑。请根据证据账本生成可直接交付的 Markdown 笔记。

${PIPELINE_TRUTHFULNESS_RULES}

资料标题：${input.sourceTitle}

${structureContract}

共同写作要求：
1. 结论必须带成立条件、数字、案例或证据上下文，不能只写抽象判断。
2. 数字必须保留语义和单位；重要数字集中进入数据表，但不要只存在于数据表。
3. 风险必须说明表现、影响和原文给出的应对；原文没有应对时写“原文未给出应对方案”。
4. 案例按背景、问题、处理、结果或启示整理，缺失字段如实省略。
5. 标题反映信息内容，段落简洁，避免同一观点跨章节重复。
6. 重点标记克制使用：🔴风险、🔵关键知识、🟠条件或待确认；不以数量充当质量。
7. 只输出完整 Markdown 笔记，不输出分析过程、评分或致歉。

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
  return `你是笔记质量修订员。请修复下列明确问题，并输出修订后的完整 Markdown。

${PIPELINE_TRUTHFULNESS_RULES}

资料标题：${input.sourceTitle}
笔记类型：${input.noteStyle === 'meeting' ? '会议纪要' : '学习/培训笔记'}

必须修复的问题：
${failedChecks}

修订规则：
1. 只使用证据账本，不得为了通过门禁补造数字、引用、案例、负责人或截止时间。
2. 保留草稿中已正确、有证据的信息；删除重复和无依据内容。
3. 学习笔记保留四个核心模块，其他模块按证据自适应。
4. 会议纪要严格保持“会议议程、会议内容、会后待办”三个一级内容模块。
5. 输出修订后的完整 Markdown，不输出评分、修改说明或分析过程。

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
  const sourceNumbers: Set<string> = extractSignificantNumbers(
    input.sourceText,
  );
  const numberCoverage: number = calculateNumberCoverage(
    sourceNumbers,
    input.note,
  );
  const minimumLength: number = getMinimumNoteLength(
    input.sourceText.trim().length,
    input.noteStyle,
  );
  const noteLength: number = input.note.trim().length;
  const traceable: boolean = hasTraceabilitySignal(input.note, input.noteStyle);
  const overlongParagraph: boolean = hasOverlongParagraph(input.note);
  const requiredSectionCount: number =
    input.noteStyle === 'meeting'
      ? MEETING_REQUIRED_SECTIONS.length
      : LEARNING_REQUIRED_SECTIONS.length;
  const structurePoints: number =
    ((requiredSectionCount - missingSections.length) / requiredSectionCount) *
    40;
  const numberPoints: number = numberCoverage * 25;
  const densityPoints: number = Math.min(1, noteLength / minimumLength) * 15;
  const traceabilityPoints: number = traceable ? 10 : 0;
  const stylePoints: number = overlongParagraph ? 5 : 10;
  const score: number = Math.round(
    Math.min(
      100,
      structurePoints +
        numberPoints +
        densityPoints +
        traceabilityPoints +
        stylePoints,
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
  if (noteLength < minimumLength) {
    failedChecks.push(
      `有效正文约 ${noteLength} 字，低于基于原文信息量计算的 ${minimumLength} 字参考下限`,
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
    (sourceNumbers.size >= 3 && numberCoverage < 0.7) ||
    !traceable;
  return {
    failedChecks,
    minimumLength,
    missingSections,
    noteLength,
    numberCoverage,
    passed: !hasHardFailure && score >= 80,
    score,
    sourceNumberCount: sourceNumbers.size,
    unexpectedSections,
  };
}
