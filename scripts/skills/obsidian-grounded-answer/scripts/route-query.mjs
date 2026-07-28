function parseArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const option = args[index];
    if (option !== '--query') {
      throw new Error(`Unsupported option: ${option}`);
    }
    const value = args[index + 1];
    if (!value) {
      throw new Error('--query requires a value');
    }
    parsed.query = value;
    index += 1;
  }
  return parsed;
}

function decideKnowledgeSearch(query) {
  const normalized = String(query || '')
    .normalize('NFKC')
    .trim();
  const explicitSkip =
    /(不要|不用|无需|别)(查|检索|参考).{0,8}(知识库|obsidian)/iu;
  const explicitSearch =
    /(知识库|obsidian|我的笔记|历史笔记|过往经验|之前的方案)/iu;
  const selfContained =
    /(翻译成|翻译为|英译中|中译英|现在几点|当前时间|今天几号|格式化这句话|改写这句话)/iu;
  const substantive =
    /(分析|评估|方案|规划|决策|风险|复盘|设计|优化|诊断|排查|写作|文章|项目|数据治理|自动化|工作流|学习|选择|比较|建议)/iu;

  if (!normalized) {
    return { search: false, reason: 'empty_query' };
  }
  if (explicitSkip.test(normalized)) {
    return { search: false, reason: 'explicit_skip' };
  }
  if (explicitSearch.test(normalized)) {
    return { search: true, reason: 'explicit_knowledge_request' };
  }
  if (selfContained.test(normalized)) {
    return { search: false, reason: 'self_contained_request' };
  }
  if (substantive.test(normalized)) {
    return { search: true, reason: 'substantive_request' };
  }
  return {
    search: normalized.length >= 18,
    reason:
      normalized.length >= 18 ? 'default_substantive' : 'low_expected_value',
  };
}

async function main() {
  const { query } = parseArgs(process.argv.slice(2));
  process.stdout.write(
    `${JSON.stringify({ query, ...decideKnowledgeSearch(query) }, null, 2)}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
});

export { decideKnowledgeSearch };
