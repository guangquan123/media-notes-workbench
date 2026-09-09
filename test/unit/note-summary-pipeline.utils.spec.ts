import {
  assessEvidencePlanCoverage,
  assessNoteQuality,
  buildEvidenceExtractionPrompt,
  buildEvidenceCoveragePlanPrompt,
  buildEvidenceGapAuditPrompt,
  buildEvidenceMergePrompt,
  buildNoteFactAuditPrompt,
  buildNoteRepairPrompt,
  buildNoteStructurePrompt,
  assessEvidenceMergeIntegrity,
  formatFactAuditFailures,
  completeEvidenceCoveragePlan,
  normalizeEvidenceCitationsForPublication,
  normalizeStructuredEvidenceLedger,
  mergeEvidenceGapAudit,
  parseEvidenceLedger,
  parseNoteFactAudit,
  preserveSourceMarkdownImages,
  splitSourceText,
} from '../../server/modules/note-jobs/note-summary-pipeline.utils';

describe('note summary pipeline utilities', () => {
  const structuredEvidenceLedger: string = [
    JSON.stringify({
      asrRisk: 'low',
      certainty: 'direct',
      id: 'E-S01-001',
      numericClaims: [
        {
          operator: 'gte',
          subject: '知识图谱模型版本',
          unit: '版本',
          value: '3.5',
        },
      ],
      sourceId: 'S01',
      statement: '知识图谱在 3.5 以上模型版本中可能无法生成。',
      timestamp: '99:07',
      type: '数字',
    }),
    JSON.stringify({
      asrRisk: 'low',
      certainty: 'direct',
      id: 'E-S02-001',
      sourceId: 'S02',
      statement: '平台已导入 361 名用户，客户总用户约 12000 名。',
      timestamp: '82:02',
      type: '事实',
    }),
  ].join('\n');

  it('parses structured JSONL evidence with stable item identifiers', () => {
    const records = parseEvidenceLedger(structuredEvidenceLedger);

    expect(records).toHaveLength(2);
    expect(records[0]).toMatchObject({
      id: 'E-S01-001',
      sourceId: 'S01',
      type: '数字',
    });
    expect(records[0].numericClaims).toEqual([
      expect.objectContaining({ operator: 'gte', value: '3.5' }),
    ]);
  });

  it('deterministically repairs duplicate structured evidence identifiers', () => {
    const duplicateLedger: string = [
      structuredEvidenceLedger.split('\n')[0],
      JSON.stringify({
        asrRisk: 'low',
        certainty: 'direct',
        id: 'E-S01-001',
        sourceId: 'S01',
        statement: '第二条不同事实。',
        type: '事实',
      }),
    ].join('\n');

    const normalized = parseEvidenceLedger(
      normalizeStructuredEvidenceLedger(duplicateLedger),
    );

    expect(normalized.map((record) => record.id)).toEqual([
      'E-S01-001',
      'E-S01-002',
    ]);
    expect(normalized[1].statement).toBe('第二条不同事实。');
  });

  it('compacts default metadata and duplicate quote text without losing semantics', () => {
    const statement = '知识图谱在 3.5 以上模型版本中可能无法生成。';
    const normalized = normalizeStructuredEvidenceLedger(
      JSON.stringify({
        asrRisk: 'low',
        certainty: 'direct',
        id: 'E-S01-700',
        numericClaims: [
          {
            operator: 'gte',
            subject: statement,
            value: '3.5',
          },
        ],
        quote: statement,
        sourceId: 'S01',
        speaker: '发言人1',
        statement,
        timestamp: '99:07',
        type: '数字',
      }),
    );
    const record = parseEvidenceLedger(normalized)[0];

    expect(normalized).not.toContain('"asrRisk":"low"');
    expect(normalized).not.toContain('"certainty":"direct"');
    expect(normalized).not.toContain('"quote"');
    expect(normalized).not.toContain('"speaker"');
    expect(normalized).not.toContain('"subject"');
    expect(normalized).not.toContain('"timestamp"');
    expect(record).toMatchObject({
      asrRisk: 'low',
      certainty: 'direct',
      id: 'E-S01-001',
      statement,
    });
    expect(record.numericClaims).toEqual([
      expect.objectContaining({
        operator: 'gte',
        subject: statement,
        value: '3.5',
      }),
    ]);
  });

  it('requires a coverage plan to map every structured evidence item', () => {
    const result = assessEvidencePlanCoverage(
      '## 核心知识体系\n- [E-S01-001] 说明知识图谱版本边界',
      structuredEvidenceLedger,
    );

    expect(result.passed).toBe(false);
    expect(result.missingEvidenceIds).toEqual(['E-S02-001']);
  });

  it('deterministically appends evidence omitted by the planning model', () => {
    const completedPlan: string = completeEvidenceCoveragePlan(
      '## 核心知识体系\n- [E-S01-001] 说明知识图谱版本边界',
      structuredEvidenceLedger,
    );

    expect(completedPlan).toContain('[E-S02-001]');
    expect(completedPlan).toContain('平台已导入 361 名用户');
    expect(
      assessEvidencePlanCoverage(completedPlan, structuredEvidenceLedger),
    ).toMatchObject({ passed: true });
  });

  it('builds a coverage-plan prompt that forbids silent evidence omission', () => {
    const prompt: string = buildEvidenceCoveragePlanPrompt({
      evidenceLedger: structuredEvidenceLedger,
      noteStyle: 'learning',
      sourceTitle: '智能体培训',
      styleRequirements: '输出详细学习笔记',
    });

    expect(prompt).toContain('E-S01-001');
    expect(prompt).toContain('每条证据');
    expect(prompt).toContain('不得静默省略');
  });

  it('rejects semantic direction reversal even when the number is present', () => {
    const result = assessNoteQuality({
      evidenceLedger: structuredEvidenceLedger,
      noteStyle: 'learning',
      note: `# 智能体培训

## 一、内容概览
本次培训介绍知识图谱版本边界与平台用户规模。[E-S01-001][E-S02-001]

## 二、核心结论与关键要点
知识图谱在 3.5 以下模型版本中可能无法生成。平台已导入 361 名用户，客户总用户约 12000 名。

## 三、核心知识体系
> 转写原话：“模型版本迭代后可能无法生成知识图谱。” [E-S01-001]

## 四、关键数据与重要事实
平台已导入 361 名用户，客户总用户约 12000 名。[E-S02-001]

## 五、一页复习
复习知识图谱兼容边界和用户规模。`,
      sourceText: '智能体培训原文。',
    });

    expect(result.passed).toBe(false);
    expect(result.semanticContradictions.join('\n')).toContain('3.5');
    expect(result.failedChecks.join('\n')).toContain('方向');
  });

  it('checks numeric direction in compact source-tagged evidence', () => {
    const result = assessNoteQuality({
      evidenceLedger:
        '[S01][数字] 知识图谱在 3.5 以上模型版本中可能无法生成。',
      noteStyle: 'learning',
      note: `# 智能体培训

## 一、内容概览
说明知识图谱版本边界。[S01]

## 二、核心结论与关键要点
知识图谱在 3.5 以下模型版本中可能无法生成。[S01]

## 三、核心知识体系
> 转写原话：“知识图谱存在版本边界。” [S01]

## 四、关键数据与重要事实
版本边界为 3.5 以下。[S01]

## 五、一页复习
复习知识图谱版本边界。`,
      sourceText: '知识图谱在 3.5 以上模型版本中可能无法生成。',
    });

    expect(result.semanticContradictions.join('\n')).toContain('3.5');
  });

  it('rejects notes that cite a source chunk but omit a structured evidence item', () => {
    const result = assessNoteQuality({
      evidenceLedger: structuredEvidenceLedger,
      noteStyle: 'learning',
      note: `# 智能体培训

## 一、内容概览
本次培训介绍知识图谱版本边界。[E-S01-001]

## 二、核心结论与关键要点
知识图谱在 3.5 以上模型版本中可能无法生成。[E-S01-001]

## 三、核心知识体系
> 转写原话：“模型版本迭代后可能无法生成知识图谱。” [E-S01-001]

## 四、关键数据与重要事实
知识图谱版本边界是项目适配的重要事实。[E-S01-001]

## 五、一页复习
必须核对模型版本边界。`,
      sourceText: '智能体培训原文。',
    });

    expect(result.passed).toBe(false);
    expect(result.missingEvidenceIds).toEqual(['E-S02-001']);
    expect(result.failedChecks.join('\n')).toContain('E-S02-001');
  });

  it('parses fact-audit JSON and exposes actionable failures', () => {
    const audit = parseNoteFactAudit(`\`\`\`json
{"passed":false,"missingEvidenceIds":["E-S02-001"],"contradictions":[{"evidenceId":"E-S01-001","message":"把3.5以上写成3.5以下"}],"unsupportedClaims":["星巴克7x24案例"],"ambiguityIssues":[]}
\`\`\``);

    expect(audit.passed).toBe(false);
    expect(formatFactAuditFailures(audit).join('\n')).toContain('3.5以上');
    expect(formatFactAuditFailures(audit).join('\n')).toContain('星巴克');
  });

  it('builds an independent fact-audit prompt from evidence and draft', () => {
    const prompt: string = buildNoteFactAuditPrompt({
      draftNote: '# 草稿',
      evidenceLedger: structuredEvidenceLedger,
      noteStyle: 'learning',
      sourceTitle: '智能体培训',
    });

    expect(prompt).toContain('独立事实审校');
    expect(prompt).toContain('主体、数值、单位、比较方向');
    expect(prompt).toContain('unsupportedClaims');
  });

  it('removes reader-visible source markers and empty delimiters from learning notes', () => {
    const published: string = normalizeEvidenceCitationsForPublication(
      '知识图谱存在版本边界。[E-S01-001]（原文出处：S01）{source: S01}（）【】\n用户规模需要核对。[S02][数字]【待人工确认】',
      structuredEvidenceLedger,
    );

    expect(published).toContain('知识图谱存在版本边界。');
    expect(published).toContain('用户规模需要核对。【待人工确认】');
    expect(published).not.toMatch(/(?:E-)?S\d+(?:-\d+)?/u);
    expect(published).not.toMatch(/[（(]\s*[）)]|【\s*】|\{\s*\}/u);
  });

  it('removes reader-visible source markers from published meeting notes', () => {
    const published: string = normalizeEvidenceCitationsForPublication(
      '会议结论已确认。[E-S01-001][数字]（来源：S01）\n风险仍待评估。[S02][风险]{S02}【待人工确认】\n\n## 纪要状态：已形成结论。\n\n不应发布的状态说明。',
      structuredEvidenceLedger,
      'meeting',
    );

    expect(published).toContain('会议结论已确认。');
    expect(published).toContain('风险仍待评估。【待人工确认】');
    expect(published).not.toMatch(/(?:E-)?S\d+(?:-\d+)?/u);
    expect(published).not.toContain('[数字]');
    expect(published).not.toContain('[风险]');
    expect(published).not.toContain('纪要状态');
  });

  it('restores source Markdown images beside semantically matching sections', () => {
    const sourceText: string = [
      '知识图谱演示',
      '![知识图谱节点画布](https://example.com/graph.png)',
      '用户管理演示',
      '![用户导入与账号激活界面](https://example.com/users.png)',
    ].join('\n');
    const note: string = `# 培训笔记

## 一、知识图谱与节点画布
介绍图谱生成过程。

## 二、用户导入与账号激活
介绍平台用户管理。

## 三、一页复习
复习核心操作。`;

    const restored: string = preserveSourceMarkdownImages(note, sourceText);

    expect(restored).toContain('https://example.com/graph.png');
    expect(restored).toContain('https://example.com/users.png');
    expect(restored.indexOf('graph.png')).toBeLessThan(
      restored.indexOf('## 二、用户导入与账号激活'),
    );
    expect(restored.indexOf('users.png')).toBeGreaterThan(
      restored.indexOf('## 二、用户导入与账号激活'),
    );
  });

  it('does not alter a note when the source contains no Markdown images', () => {
    expect(
      preserveSourceMarkdownImages('# 笔记\n\n正文', '纯文本原始材料'),
    ).toBe('# 笔记\n\n正文');
  });

  it('splits long source text without dropping or reordering content', () => {
    const sourceText: string = [
      '第一段：项目背景与目标。',
      '第二段：数据库有 12 个产品库。',
      '第三段：改造花了 3 个工程月。',
      '第四段：改造后版本无法升级。',
    ].join('\n\n');

    const chunks = splitSourceText(sourceText, 32);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.map((chunk) => chunk.content).join('')).toBe(sourceText);
    expect(chunks.map((chunk) => chunk.index)).toEqual(
      chunks.map((_: unknown, index: number) => index + 1),
    );
  });

  it('builds an evidence prompt that preserves facts and source anchors', () => {
    const [chunk] = splitSourceText(
      '[00:03:21] 培训人：达梦一个实例约 30 万。',
      100,
    );
    const prompt: string = buildEvidenceExtractionPrompt(chunk, 1);

    expect(prompt).toContain('证据账本');
    expect(prompt).toContain('所有影响范围');
    expect(prompt).toContain('完整保留事实、数字');
    expect(prompt).toContain('转写原话');
    expect(prompt).toContain('[S01]');
    expect(prompt).toContain('不得补充');
  });

  it('builds a source-to-ledger audit prompt that looks only for omissions', () => {
    const [chunk] = splitSourceText(
      '[82:02] 平台导入 361 人，客户总用户约 12000 人，活跃 102 人。',
      200,
    );
    const prompt: string = buildEvidenceGapAuditPrompt(
      chunk,
      structuredEvidenceLedger,
    );

    expect(prompt).toContain('证据缺口审计员');
    expect(prompt).toContain('原文分块');
    expect(prompt).toContain('现有证据账本');
    expect(prompt).toContain('只输出真正遗漏');
    expect(prompt).toContain('NO_MISSING_EVIDENCE');
  });

  it('merges missing evidence and deterministically repairs duplicate IDs', () => {
    const supplement: string = JSON.stringify({
      asrRisk: 'low',
      certainty: 'direct',
      id: 'E-S01-001',
      quote: '节点定位时右侧变化，但中间画布没有同步跳转。',
      sourceId: 'S01',
      statement: '节点定位时右侧变化，但中间画布没有同步跳转。',
      type: '风险',
    });

    const merged = parseEvidenceLedger(
      mergeEvidenceGapAudit(
        structuredEvidenceLedger,
        supplement,
        '节点定位时右侧变化，但中间画布没有同步跳转。',
      ),
    );

    expect(merged).toHaveLength(3);
    expect(merged.map((record) => record.id)).toEqual([
      'E-S01-001',
      'E-S02-001',
      'E-S01-002',
    ]);
    expect(merged[2].statement).toContain('画布');
  });

  it('keeps the original ledger when the gap audit reports no omission', () => {
    expect(
      mergeEvidenceGapAudit(
        structuredEvidenceLedger,
        'NO_MISSING_EVIDENCE',
        '原文内容',
      ),
    ).toBe(structuredEvidenceLedger);
  });

  it('ignores gap-audit evidence without an exact source quote', () => {
    const fabricatedSupplement: string = JSON.stringify({
      asrRisk: 'low',
      certainty: 'direct',
      id: 'E-S01-900',
      quote: '原文中不存在的逐字引用',
      sourceId: 'S01',
      statement: '系统支持不存在的功能。',
      type: '事实',
    });

    expect(
      mergeEvidenceGapAudit(
        structuredEvidenceLedger,
        fabricatedSupplement,
        '这里只提到了提示词生成器。',
      ),
    ).toBe(structuredEvidenceLedger);
  });

  it('keeps valid gap-audit evidence when another item is ungrounded', () => {
    const validQuote: string = '提示词生成器可以帮助生成提示词。';
    const supplement: string = [
      JSON.stringify({
        asrRisk: 'low',
        certainty: 'direct',
        id: 'E-S01-900',
        quote: validQuote,
        sourceId: 'S01',
        statement: validQuote,
        type: '事实',
      }),
      JSON.stringify({
        asrRisk: 'low',
        certainty: 'direct',
        id: 'E-S01-901',
        quote: '原文中不存在的逐字引用',
        sourceId: 'S01',
        statement: '系统支持不存在的功能。',
        type: '事实',
      }),
    ].join('\n');

    const merged = parseEvidenceLedger(
      mergeEvidenceGapAudit(
        structuredEvidenceLedger,
        supplement,
        validQuote,
      ),
    );

    expect(merged).toHaveLength(3);
    expect(merged[2].statement).toBe(validQuote);
  });

  it('builds a lossless evidence merge prompt for long ledgers', () => {
    const prompt: string = buildEvidenceMergePrompt(
      '[S01][数字] 12 个产品库\n[S02][风险] 版本无法升级',
    );

    expect(prompt).toContain('不得删除任何唯一数字');
    expect(prompt).toContain('保留 [S01]');
    expect(prompt).toContain('[S02][风险]');
  });

  it('detects source, type and number loss during evidence compaction', () => {
    const integrity = assessEvidenceMergeIntegrity(
      [
        '[S01][数字] 数据库实例约 30 万。',
        '[S02][风险] 合并实例会导致版本无法升级。',
        '[S03][数字] 项目投入 3 个工程月完成改造。',
        '[S03][案例] 项目通过改造解决了实例冲突。',
      ].join('\n'),
      '[S01][数字] 数据库实例约 30 万。',
    );

    expect(integrity.passed).toBe(false);
    expect(integrity.missingSourceIds).toEqual(['[S02]', '[S03]']);
    expect(integrity.missingEvidenceTypes).toEqual(['风险', '案例']);
    expect(integrity.missingNumbers).toContain('3');
  });

  it('accepts evidence compaction that preserves integrity signals', () => {
    const integrity = assessEvidenceMergeIntegrity(
      [
        '[S01][数字] 数据库实例约 30 万。',
        '[S02][风险] 合并实例会导致版本无法升级。',
      ].join('\n'),
      '[S01][S02][数字] 数据库实例约 30 万。\n' +
        '[S02][风险] 合并实例会导致版本无法升级。',
    );

    expect(integrity.passed).toBe(true);
    expect(integrity.missingSourceIds).toEqual([]);
    expect(integrity.missingEvidenceTypes).toEqual([]);
    expect(integrity.missingNumbers).toEqual([]);
  });

  it('uses flexible learning modules and the fixed three-part meeting contract', () => {
    const learningPrompt: string = buildNoteStructurePrompt({
      evidenceLedger: '[S01][事实] 示例事实',
      noteStyle: 'learning',
      sourceTitle: '培训内容',
      styleRequirements: '强调风险和案例',
    });
    const meetingPrompt: string = buildNoteStructurePrompt({
      evidenceLedger: '[S01][待办] 张三周五前提交报告',
      noteStyle: 'meeting',
      sourceTitle: '项目周会',
      styleRequirements: '表达简洁',
    });

    expect(learningPrompt).toContain('# 标题');
    expect(learningPrompt).toContain('延续平台已发布的学习/培训笔记结构');
    expect(learningPrompt).toContain('证据驱动规则');
    expect(learningPrompt).toContain('必须输出对应独立模块');
    expect(learningPrompt).not.toContain('必须包含全部 10 章');
    expect(meetingPrompt).toContain('只允许三个一级内容模块');
    expect(meetingPrompt).toContain('一、会议议程');
    expect(meetingPrompt).toContain('二、会议内容');
    expect(meetingPrompt).toContain('三、会后待办');
  });

  it('keeps learning and meeting structure instructions fully isolated', () => {
    const learningRepairPrompt: string = buildNoteRepairPrompt({
      draftNote: '# 学习笔记草稿',
      evidenceLedger: '[S01][事实] 示例事实',
      failedChecks: ['补充遗漏的信息'],
      noteStyle: 'learning',
      sourceTitle: '培训材料',
      styleRequirements:
        '保留标题、内容概览、核心结论或关键要点、核心知识体系和一页复习。',
    });
    const meetingRepairPrompt: string = buildNoteRepairPrompt({
      draftNote: '# 会议纪要草稿',
      evidenceLedger: '[S01][待办] 示例待办',
      failedChecks: ['补充遗漏的信息'],
      noteStyle: 'meeting',
      sourceTitle: '项目周会',
      styleRequirements: '只输出会议议程、会议内容和会后待办。',
    });

    expect(learningRepairPrompt).toContain('学习/培训笔记');
    expect(learningRepairPrompt).not.toContain('会议议程');
    expect(learningRepairPrompt).not.toContain('会议内容');
    expect(learningRepairPrompt).not.toContain('会后待办');
    expect(meetingRepairPrompt).toContain('会议纪要');
    expect(meetingRepairPrompt).not.toContain('内容概览');
    expect(meetingRepairPrompt).not.toContain('核心知识体系');
    expect(meetingRepairPrompt).not.toContain('一页复习');
  });

  it('rejects a learning note that drops required modules and source numbers', () => {
    const result = assessNoteQuality({
      noteStyle: 'learning',
      note: '# 数据库培训\n\n## 内容概览\n\n介绍数据库改造。',
      sourceText:
        '客户只有 1 个实例，需要承载 12 个产品库，许可证约 30 万，改造用了 3 个工程月。',
    });

    expect(result.passed).toBe(false);
    expect(result.missingSections).toEqual(
      expect.arrayContaining([
        '核心结论与关键要点',
        '核心知识体系',
        '一页复习',
      ]),
    );
    expect(result.numberCoverage).toBeLessThan(0.7);
    expect(result.failedChecks.join('\n')).toContain('数字');
  });

  it('requires a learning-note title without applying meeting sections', () => {
    const result = assessNoteQuality({
      noteStyle: 'learning',
      note: `## 内容概览
内容概览。
## 核心结论与关键要点
关键要点。
## 核心知识体系
> 转写原话：“示例。”
## 一页复习
复习内容。`,
      sourceText: '示例培训内容。',
    });

    expect(result.passed).toBe(false);
    expect(result.missingSections).toContain('标题');
    expect(result.missingSections).not.toContain('会议议程');
  });

  it('does not treat transcript timestamps or URL digits as facts to preserve', () => {
    const result = assessNoteQuality({
      noteStyle: 'learning',
      note: `# 示例

## 内容概览
内容概览。
## 核心结论与关键要点
关键要点。
## 核心知识体系
> 转写原话：“示例。”
## 一页复习
复习内容。`,
      sourceText:
        '[00:03:21] 示例内容，来源 https://example.com/video/12345 。',
    });

    expect(result.sourceNumberCount).toBe(0);
    expect(result.numberCoverage).toBe(1);
  });

  it('does not treat source and speaker identifiers as important numbers', () => {
    const result = assessNoteQuality({
      noteStyle: 'learning',
      note: `# 示例

## 内容概览
内容概览。
## 核心结论与关键要点
关键要点。
## 核心知识体系
> 转写原话：“示例。”
## 一页复习
复习内容。`,
      sourceText:
        '[来源 1：培训.txt]\n[00:03] 发言人1：示例。\n[00:06] 发言人2：补充示例。',
    });

    expect(result.sourceNumberCount).toBe(0);
    expect(result.numberCoverage).toBe(1);
  });

  it('uses explicit numeric evidence instead of every source digit', () => {
    const result = assessNoteQuality({
      evidenceLedger: [
        '[S01][事实] 平台有 4 种模板。',
        '[S01][数字] 项目包含 12 个数据库。',
        '[S01][数字] 改造投入 3 名工程人员。',
      ].join('\n'),
      noteStyle: 'learning',
      note: `# 项目培训笔记

## 内容概览
本次培训说明项目的数据库改造背景。

## 核心结论与关键要点
项目包含 12 个数据库，改造投入 3 名工程人员。

## 核心知识体系
> 转写原话：“数据库改造需要评估工程投入。”

## 一页复习
必须记住 12 个数据库和 3 名工程人员两个关键规模信息。`,
      sourceText:
        '平台有 4 种模板，项目包含 12 个数据库，改造投入 3 名工程人员。',
    });

    expect(result.sourceNumberCount).toBe(2);
    expect(result.numberCoverage).toBe(1);
  });

  it('rejects low coverage of explicitly extracted important numbers', () => {
    const result = assessNoteQuality({
      noteStyle: 'learning',
      note: `# 数据培训笔记

## 内容概览
本次培训说明数据平台的建设背景、范围与使用方式，并整理后续复习所需的核心知识。

## 核心结论与关键要点
平台当前包含 1 个核心实例。其余规模数字需要结合原始材料继续核对，不应脱离上下文机械罗列。

## 核心知识体系
> 转写原话：“平台建设需要同时考虑使用规模、实施投入和长期维护。”

核心知识包括实例规划、数据范围、实施成本与维护边界。数字只有在能解释业务含义时才应进入正文，不能为了通过规则而堆砌。

## 一页复习
必须理解：总结应保留真正影响判断的数字，同时维持信息上下文和可追溯性。`,
      sourceText:
        '平台有 1 个实例、12 个数据库、30 个接口和 60 个功能，需要结合上下文评估。',
    });

    expect(result.numberCoverage).toBe(0.25);
    expect(result.failedChecks.join('\n')).toContain('数字覆盖率');
    expect(result.score).toBeGreaterThanOrEqual(80);
    expect(result.passed).toBe(false);
  });

  it('rejects a learning note that omits evidence-driven detail modules', () => {
    const evidenceLedger: string = [
      '[S01][关系] 数据治理、指标平台和智能体之间存在调用链路。',
      '[S01][步骤] 上线前先确认模型，再检查权限，最后发布。',
      '[S02][案例] 客户合并数据库实例后投入了额外改造工作。',
      '[S02][对比] 模型直连正常，通过网关中转后性能下降。',
      '[S02][数字] 项目包含 12 个产品库。',
      '[S02][风险] 合并实例可能导致版本无法升级。',
      '[S03][术语] Dataset 指用于生成问答对的数据集插件。',
      '[S03][待研究] 需要确认知识图谱模型兼容范围。',
    ].join('\n');
    const result = assessNoteQuality({
      evidenceLedger,
      noteStyle: 'learning',
      note: `# 平台培训笔记

## 一、内容概览
本次培训介绍平台功能和项目实施问题。

## 二、核心结论与关键要点
平台实施需要兼顾数据、模型和权限。

## 三、核心知识体系
> 转写原话：“平台实施需要系统评估。” [S01]

正文只保留了概括性知识，没有展开案例和风险。

## 四、一页复习
记住平台实施需要系统评估。`,
      sourceText: '平台培训原文。',
    });

    expect(result.passed).toBe(false);
    expect(result.failedChecks.join('\n')).toContain('知识关系与整体逻辑');
    expect(result.failedChecks.join('\n')).toContain('重要案例');
    expect(result.failedChecks.join('\n')).toContain('关键数据与重要事实');
    expect(result.failedChecks.join('\n')).toContain('风险、误区与注意事项');
    expect(result.failedChecks.join('\n')).toContain('关键术语');
    expect(result.failedChecks.join('\n')).toContain('仍需进一步研究的问题');
  });

  it('rejects a note that does not cover every evidence source chunk', () => {
    const result = assessNoteQuality({
      evidenceLedger: [
        '[S01][事实] 第一部分介绍平台背景。',
        '[S02][事实] 第二部分介绍项目限制。',
        '[S03][事实] 第三部分介绍交付结论。',
      ].join('\n'),
      noteStyle: 'learning',
      note: `# 项目培训笔记

## 内容概览
介绍平台背景。[S01]
## 核心结论与关键要点
整理项目要点。
## 核心知识体系
> 转写原话：“介绍平台背景。” [S01]
## 一页复习
复习平台背景。`,
      sourceText: '项目培训原文。',
    });

    expect(result.passed).toBe(false);
    expect(result.failedChecks.join('\n')).toContain('来源分块');
    expect(result.failedChecks.join('\n')).toContain('S02');
    expect(result.failedChecks.join('\n')).toContain('S03');
  });

  it('rejects evidence IDs that are present without nearby supporting content', () => {
    const result = assessNoteQuality({
      evidenceLedger: structuredEvidenceLedger,
      noteStyle: 'learning',
      note: `# 平台培训笔记

## 一、内容概览
培训介绍知识图谱的模型版本边界。[E-S01-001]

## 二、核心结论与关键要点
知识图谱在 3.5 以上版本可能无法生成。[E-S01-001]

## 三、核心知识体系
> 转写原话：“3.5 以上模型版本可能无法生成知识图谱。” [E-S01-001]

## 四、一页复习
记住知识图谱版本边界。

[E-S02-001]`,
      sourceText:
        '知识图谱在 3.5 以上模型版本中可能无法生成。平台已导入 361 名用户，客户总用户约 12000 名。',
    });

    expect(result.passed).toBe(false);
    expect(result.ungroundedEvidenceIds).toEqual(['E-S02-001']);
    expect(result.failedChecks.join('\n')).toContain('引用未承载对应事实');
  });

  it('accepts evidence IDs placed beside semantically matching paraphrases', () => {
    const result = assessNoteQuality({
      evidenceLedger: structuredEvidenceLedger,
      noteStyle: 'learning',
      note: `# 平台培训笔记

## 一、内容概览
培训涉及知识图谱版本限制与用户导入规模。[E-S01-001][E-S02-001]

## 二、核心结论与关键要点
知识图谱在 3.5 以上版本可能无法生成。[E-S01-001]

## 三、核心知识体系
> 转写原话：“平台导入 361 名用户，客户约有 12000 名用户。” [E-S02-001]

## 四、关键数据与重要事实
| 事实 | 含义 |
|-|-|
| 3.5 以上 | 知识图谱存在模型版本边界 | [E-S01-001]
| 361 名、约 12000 名 | 平台已导入用户与客户总用户规模 | [E-S02-001]

## 五、一页复习
记住知识图谱版本限制与用户规模。`,
      sourceText:
        '知识图谱在 3.5 以上模型版本中可能无法生成。平台已导入 361 名用户，客户总用户约 12000 名。',
    });

    expect(result.ungroundedEvidenceIds).toEqual([]);
  });

  it('accepts a detailed learning note that covers every evidence category', () => {
    const evidenceLedger: string = [
      '[S01][关系] 数据治理、指标平台和智能体之间存在调用链路。',
      '[S01][步骤] 上线前先确认模型，再检查权限，最后发布。',
      '[S02][案例] 客户合并数据库实例后投入了额外改造工作。',
      '[S02][对比] 模型直连正常，通过网关中转后性能下降。',
      '[S02][数字] 项目包含 12 个产品库。',
      '[S02][风险] 合并实例可能导致版本无法升级。',
      '[S03][术语] Dataset 指用于生成问答对的数据集插件。',
      '[S03][待研究] 需要确认知识图谱模型兼容范围。',
    ].join('\n');
    const result = assessNoteQuality({
      evidenceLedger,
      noteStyle: 'learning',
      note: `# 平台实施与智能体培训笔记

## 一、内容概览
本次培训覆盖数据链路、上线流程和项目实施风险。[S01][S02]

## 二、核心结论与关键要点
项目实施既要理解平台关系，也要保留客户案例与限制条件。[S02]

## 三、核心知识体系
> 转写原话：“上线前需要先确认模型和权限。” [S01]

## 四、一页复习
必须记住平台关系、上线顺序和实例合并风险。

## 五、知识关系与整体逻辑
整理归纳：数据治理经过指标平台连接智能体，形成完整调用链路。[S01]

## 六、方法、流程与复用清单
1. 确认模型。
2. 检查权限。
3. 发布应用。[S01]

## 七、重要案例
客户合并数据库实例后产生额外改造工作。[S02]

## 八、对比与区别
模型直连正常，而通过网关中转后性能下降。[S02]

## 九、关键数据与重要事实
| 数据 | 含义 |
|-|-|
| 12 个产品库 | 项目数据规模 | [S02]

## 十、风险、误区与注意事项
实例合并存在版本无法升级的明确风险；原文未给出应对方案。[S02]

## 十一、关键术语
Dataset 是用于生成问答对的数据集插件。[S03]

## 十二、仍需进一步研究的问题
需要确认知识图谱模型的兼容范围。[S03]`,
      sourceText: '平台培训原文。',
    });

    expect(result.evidenceCoverage).toBe(1);
    expect(result.sourceAnchorCoverage).toBe(1);
    expect(result.passed).toBe(true);
  });

  it('does not mistake a readable markdown list for one long paragraph', () => {
    const longList: string = Array.from(
      { length: 20 },
      (_: unknown, index: number): string =>
        `- 要点 ${index + 1}：${'说明'.repeat(20)}`,
    ).join('\n');
    const result = assessNoteQuality({
      noteStyle: 'learning',
      note: `# 列表培训笔记

## 内容概览
本次培训使用列表整理要点。

## 核心结论与关键要点
${longList}

## 核心知识体系
> 转写原话：“列表用于拆分不同观点。”

## 一页复习
按条目复习。`,
      sourceText: '列表用于拆分不同观点。',
    });

    expect(result.failedChecks.join('\n')).not.toContain('600 字');
  });

  it('accepts a dense learning note with adaptive modules and number coverage', () => {
    const sourceText: string =
      '客户只有 1 个实例，需要承载 12 个产品库，许可证约 30 万，改造用了 3 个工程月。改造后版本无法升级。';
    const note: string = `# 数据库合并改造培训笔记

## 一、内容概览

本次培训说明客户将 **12 个产品库**部署到 **1 个实例**时产生的成本与升级风险。

## 二、核心结论与关键要点

1. 🔴 合并实例会造成表名冲突，改造成本不能只按许可证价格评估。
2. 🔵 许可证约 **30 万**，但适配工作实际耗费 **3 个工程月**。

## 三、核心知识体系

### 实例合并的连锁影响

> 转写原话：“改造后版本无法升级。”

背景是客户希望减少实例数量；直接后果是表名需要统一，完成改造后版本被固化。

## 四、一页复习

- 必须记住：1 个实例承载 12 个产品库并不等于低成本。
- 必须理解：许可证费用与后续适配、升级成本需要一起评估。
`;
    const result = assessNoteQuality({
      note,
      noteStyle: 'learning',
      sourceText,
    });

    expect(result.missingSections).toEqual([]);
    expect(result.numberCoverage).toBe(1);
    expect(result.passed).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(80);
  });

  it('enforces exactly the three meeting sections without a status declaration', () => {
    const sourceText: string =
      '项目周会讨论了接口延期。会议决定张三在 7 月 31 日前提交评估报告。';
    const note: string = `# 项目周会纪要

## 一、会议议程

1. 接口延期与评估报告

## 二、会议内容

会议确认接口存在延期风险，并决定补充评估。[S01]

## 三、会后待办

| 待办事项 | 负责人 | 截止时间 |
|-|-|-|
| 提交评估报告 | 张三 | 7 月 31 日 |
`;
    const result = assessNoteQuality({
      note,
      noteStyle: 'meeting',
      sourceText,
    });

    expect(result.missingSections).toEqual([]);
    expect(result.passed).toBe(true);
  });

  it('rejects extra first-level meeting content modules', () => {
    const result = assessNoteQuality({
      noteStyle: 'meeting',
      note: `# 项目周会纪要

## 一、会议议程
接口进度。
## 二、会议内容
会议讨论接口进度。
## 四、额外总结
补充总结。
## 三、会后待办
暂无明确待办。`,
      sourceText: '会议讨论接口进度，暂未形成明确结论。',
    });

    expect(result.passed).toBe(false);
    expect(result.failedChecks.join('\n')).toContain('额外一级模块');
  });

  it('allows meeting supporting sections outside the three content modules', () => {
    const result = assessNoteQuality({
      noteStyle: 'meeting',
      note: `# 项目周会纪要

## 会议基本信息
主题：接口进度。
## 会议结论摘要
暂无明确结论。
## 一、会议议程
接口进度。
## 二、会议内容
会议讨论接口进度。[S01]
## 三、会后待办
暂无明确待办。
## 原文归档
[查看完整原文](https://example.com/source)
`,
      sourceText: '会议讨论接口进度，暂未形成明确结论。',
    });

    expect(result.unexpectedSections).toEqual([]);
  });

  it('does not allow similarly named meeting supporting sections', () => {
    const result = assessNoteQuality({
      noteStyle: 'meeting',
      note: `# 项目周会纪要
## 一、会议议程
接口进度。
## 二、会议内容
会议讨论接口进度。[S01]
## 三、会后待办
暂无明确待办。
## 会议基本信息补充
不应作为标准模块。`,
      sourceText: '会议讨论接口进度，暂未形成明确结论。',
    });

    expect(result.unexpectedSections).toContain('会议基本信息补充');
  });

  it('rejects unresolved placeholders as a hard failure', () => {
    const result = assessNoteQuality({
      noteStyle: 'meeting',
      note: `# 项目周会纪要

## 一、会议议程
接口进度。
## 二、会议内容
形成 N 项核心议定。[S01]
## 三、会后待办
暂无明确待办。`,
      sourceText: '会议讨论接口进度，暂未形成明确结论。',
    });

    expect(result.passed).toBe(false);
    expect(result.failedChecks.join('\n')).toContain('未替换占位符');
  });

  it('ignores placeholders in the system source archive', () => {
    const result = assessNoteQuality({
      noteStyle: 'meeting',
      note: `# 项目周会纪要
## 一、会议议程
接口进度。
## 二、会议内容
会议讨论接口进度。[S01]
## 三、会后待办
暂无明确待办。
## 原文归档
原文示例：N 项、TODO。`,
      sourceText: '会议讨论接口进度，暂未形成明确结论。',
    });

    expect(result.failedChecks.join('\n')).not.toContain('未替换占位符');
  });

  it('rejects a meeting note that drops disagreements and risks', () => {
    const result = assessNoteQuality({
      evidenceLedger: [
        '[S01][分歧] 甲方建议本周上线，乙方认为测试尚未完成。',
        '[S02][风险] 未完成回归测试会增加生产故障风险。',
        '[S03][限制] 上线前依赖客户开放防火墙端口。',
      ].join('\n'),
      noteStyle: 'meeting',
      note: `# 项目会议纪要

## 一、会议议程
讨论上线安排。
## 二、会议内容
会议讨论了上线安排。[S01]
## 三、会后待办
暂无明确待办。`,
      sourceText: '项目会议原文。',
    });

    expect(result.passed).toBe(false);
    expect(result.failedChecks.join('\n')).toContain('分歧');
    expect(result.failedChecks.join('\n')).toContain('风险');
    expect(result.failedChecks.join('\n')).toContain('限制');
  });

  it('accepts a meeting note that preserves disagreements, risks and limits', () => {
    const result = assessNoteQuality({
      evidenceLedger: [
        '[S01][分歧] 甲方建议本周上线，乙方认为测试尚未完成。',
        '[S02][风险] 未完成回归测试会增加生产故障风险。',
        '[S03][限制] 上线前依赖客户开放防火墙端口。',
      ].join('\n'),
      noteStyle: 'meeting',
      note: `# 项目会议纪要

## 一、会议议程
讨论上线安排与测试条件。

## 二、会议内容
- 分歧：甲方建议本周上线，乙方认为测试尚未完成。[S01]
- 风险：未完成回归测试会增加生产故障风险。[S02]
- 限制与依赖：上线前依赖客户开放防火墙端口。[S03]
- 会议未形成明确结论，最终上线日期待确认。

## 三、会后待办
| 待办事项 | 负责人 | 截止时间 | 输出结果 | 依赖 |
|-|-|-|-|-|
| 完成回归测试并确认端口 | 待确认 | 待确认 | 测试结果 | 客户开放端口 |`,
      sourceText: '项目会议原文。',
    });

    expect(result.evidenceCoverage).toBe(1);
    expect(result.sourceAnchorCoverage).toBe(1);
    expect(result.passed).toBe(true);
  });

  it('builds a repair prompt from concrete failed checks', () => {
    const prompt: string = buildNoteRepairPrompt({
      draftNote: '# 草稿',
      evidenceLedger: '[S01][数字] 12 个产品库',
      failedChecks: ['缺少“一页复习”', '数字覆盖率只有 50%'],
      noteStyle: 'learning',
      sourceTitle: '培训内容',
      styleRequirements: '保持高信息密度',
    });

    expect(prompt).toContain('缺少“一页复习”');
    expect(prompt).toContain('数字覆盖率只有 50%');
    expect(prompt).toContain('只使用证据账本');
    expect(prompt).toContain('输出修订后的完整 Markdown');
    expect(prompt).toContain('逐类核对');
  });
});
