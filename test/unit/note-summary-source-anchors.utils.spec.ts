import {
  augmentEvidenceLedgerWithSourceAnchors,
  extractHighValueSourceAnchors,
} from '../../server/modules/note-jobs/note-summary-source-anchors.utils';
import { parseEvidenceLedger } from '../../server/modules/note-jobs/note-summary-pipeline.utils';

describe('note summary source anchors', () => {
  it('retains numeric, operational, risk and case details without keeping filler', () => {
    const sourceText: string = [
      '[08:34] 发言人1: 当前可以配置 4 种分支，也可以扩展到 24 种。',
      '[28:21] 发言人1: 节点列表定位后，右边动了，但中间画布没有跟着跳。',
      '[35:34] 发言人1: 不会写提示词时，可以打开弹窗调用模型生成，再校准后引用。',
      '[64:13] 发言人2: 客户想增加第五个模板，目前需要代码开发。',
      '[82:02] 发言人1: 平台导入 361 个用户，客户约一万二千个用户，活跃用户 102 个。',
      '[90:07] 发言人2: 数据集生成了 11 个问题。',
      '[94:04] 发言人1: Top-K 默认返回 10 条。',
      '[99:07] 发言人1: 模型版本在 3.5 以上时，知识图谱可能搞不出来。',
      '[99:12] 发言人1: 检索结果最多不超过 10 条。',
      '[99:16] 发言人1: CPU 实际使用率只有 0..9%。',
      '[99:24] 发言人2: 嗯嗯。',
    ].join('\n\n');

    const anchors = extractHighValueSourceAnchors(sourceText, 'S01');
    const statements: string = anchors
      .map((anchor): string => anchor.statement)
      .join('\n');

    expect(statements).toContain('24 种');
    expect(statements).toContain('画布没有跟着跳');
    expect(statements).toContain('提示词');
    expect(statements).toContain('第五个模板');
    expect(statements).toContain('361 个用户');
    expect(statements).toContain('11 个问题');
    expect(statements).toContain('Top-K');
    expect(statements).toContain('3.5 以上');
    expect(statements).not.toContain('嗯嗯');
    expect(
      anchors
        .flatMap((anchor) => anchor.numericClaims || [])
        .find((claim) => claim.value === '3.5'),
    ).toMatchObject({ operator: 'gte' });
    expect(
      anchors
        .flatMap((anchor) => anchor.numericClaims || [])
        .find(
          (claim) => claim.value === '10' && claim.subject.includes('不超过'),
        ),
    ).toMatchObject({ operator: 'lte' });
    expect(
      anchors
        .flatMap((anchor) => anchor.numericClaims || [])
        .find((claim) => claim.subject.includes('实际使用率')),
    ).toMatchObject({ value: '0.9%' });
  });

  it('adds only anchors that are not already quoted in the evidence ledger', () => {
    const existingQuote: string = '平台导入 361 个用户。';
    const evidenceLedger: string = JSON.stringify({
      asrRisk: 'low',
      certainty: 'direct',
      id: 'E-S01-001',
      quote: existingQuote,
      sourceId: 'S01',
      statement: '平台导入了 361 个用户。',
      type: '数字',
    });
    const sourceText: string = [
      `[82:02] 发言人1: ${existingQuote}`,
      '[99:07] 发言人1: 模型版本在 3.5 以上时，知识图谱可能搞不出来。',
    ].join('\n');

    const merged: string = augmentEvidenceLedgerWithSourceAnchors(
      evidenceLedger,
      { content: sourceText, index: 1 },
    );
    const records = parseEvidenceLedger(merged);

    expect(records).toHaveLength(2);
    expect(
      records.filter((record) => record.quote === existingQuote),
    ).toHaveLength(1);
    expect(records[1]).toMatchObject({
      asrRisk: 'medium',
      id: 'E-S01-002',
      quote: '模型版本在 3.5 以上时，知识图谱可能搞不出来。',
      sourceId: 'S01',
      type: '数字',
    });
  });
});
