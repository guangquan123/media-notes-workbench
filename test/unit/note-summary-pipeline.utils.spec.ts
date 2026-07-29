import {
  assessNoteQuality,
  buildEvidenceExtractionPrompt,
  buildEvidenceMergePrompt,
  buildNoteRepairPrompt,
  buildNoteStructurePrompt,
  splitSourceText,
} from '../../server/modules/note-jobs/note-summary-pipeline.utils';

describe('note summary pipeline utilities', () => {
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
    expect(prompt).toContain('所有数字');
    expect(prompt).toContain('转写原话');
    expect(prompt).toContain('[S01]');
    expect(prompt).toContain('不得补充');
  });

  it('builds a lossless evidence merge prompt for long ledgers', () => {
    const prompt: string = buildEvidenceMergePrompt(
      '[S01][数字] 12 个产品库\n[S02][风险] 版本无法升级',
    );

    expect(prompt).toContain('不得删除任何唯一数字');
    expect(prompt).toContain('保留 [S01]');
    expect(prompt).toContain('[S02][风险]');
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
    expect(learningPrompt).toContain('按证据决定是否出现');
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

  it('enforces exactly the three meeting sections and a status declaration', () => {
    const sourceText: string =
      '项目周会讨论了接口延期。会议决定张三在 7 月 31 日前提交评估报告。';
    const note: string = `# 项目周会纪要

## 一、会议议程

1. 接口延期与评估报告

## 二、会议内容

会议确认接口存在延期风险，并决定补充评估。

## 三、会后待办

| 待办事项 | 负责人 | 截止时间 |
|-|-|-|
| 提交评估报告 | 张三 | 7 月 31 日 |

纪要状态：所有议题均已形成明确结论，所有待办均已明确负责人和截止时间。
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
暂无明确待办。

纪要状态：1 个议题暂未形成明确结论，0 项待办信息待确认。`,
      sourceText: '会议讨论接口进度，暂未形成明确结论。',
    });

    expect(result.passed).toBe(false);
    expect(result.failedChecks.join('\n')).toContain('额外一级模块');
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
  });
});
