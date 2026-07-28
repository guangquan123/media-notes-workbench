const DEFAULT_SYNONYM_GROUPS = [
  ['知识库', 'obsidian', '笔记', '知识资产'],
  ['解决方案', '方案', '做法', '路径'],
  ['复盘', '回顾', '总结'],
  ['风险', '问题', '隐患'],
  ['数据治理', '数据管理', '治理体系'],
  ['验证', '核验', '校验', '检查'],
  ['自动化', '工作流', '流程编排'],
];
const STOP_TERMS = new Set([
  '一个',
  '一些',
  '一下',
  '什么',
  '怎么',
  '如何',
  '帮我',
  '我的',
  '这个',
  '那个',
  '可以',
  '进行',
  '给出',
]);

function normalize(value = '') {
  return String(value)
    .normalize('NFKC')
    .toLocaleLowerCase('zh-CN')
    .replace(/\s+/gu, ' ')
    .trim();
}

function expandQuery(query, synonymGroups = DEFAULT_SYNONYM_GROUPS) {
  const normalized = normalize(query);
  const weightedTerms = new Map();
  const add = (term, weight, source) => {
    const value = normalize(term);
    if (value.length < 2 || STOP_TERMS.has(value)) {
      return;
    }
    const previous = weightedTerms.get(value);
    if (!previous || previous.weight < weight) {
      weightedTerms.set(value, { source, term: value, weight });
    }
  };

  add(normalized, 10, 'full_query');
  for (const term of normalized.split(/[\s,，。！？!?；;:/、]+/u)) {
    add(term, 7, 'token');
  }
  const chineseRuns = normalized.match(/[\u3400-\u9fff]{2,}/gu) || [];
  for (const run of chineseRuns) {
    add(run, 8, 'chinese_run');
    for (let index = 0; index < run.length - 1; index += 1) {
      add(run.slice(index, index + 2), 1.5, 'bigram');
    }
  }
  const segmenter = new Intl.Segmenter('zh-CN', {
    granularity: 'word',
  });
  for (const segment of segmenter.segment(normalized)) {
    if (segment.isWordLike) {
      add(segment.segment, 6, 'word');
    }
  }
  const latinTerms = normalized.match(/[a-z0-9][a-z0-9_-]{1,}/gu) || [];
  for (const term of latinTerms) {
    add(term, 6, 'latin');
  }

  const presentTerms = new Set(weightedTerms.keys());
  for (const group of synonymGroups) {
    const normalizedGroup = group.map((term) => normalize(term));
    if (
      normalizedGroup.some((term) =>
        [...presentTerms].some(
          (present) => present.includes(term) || term.includes(present),
        ),
      )
    ) {
      for (const synonym of normalizedGroup) {
        add(synonym, 2.5, 'synonym');
      }
    }
  }
  return [...weightedTerms.values()];
}

function countOccurrences(value, term) {
  let count = 0;
  let position = 0;
  while (position >= 0) {
    position = value.indexOf(term, position);
    if (position < 0) {
      break;
    }
    count += 1;
    position += term.length;
  }
  return count;
}

function characterTrigrams(value) {
  const compact = normalize(value).replace(/\s+/gu, '');
  const grams = new Set();
  if (compact.length <= 3) {
    if (compact) {
      grams.add(compact);
    }
    return grams;
  }
  for (let index = 0; index < compact.length - 2; index += 1) {
    grams.add(compact.slice(index, index + 3));
  }
  return grams;
}

function jaccard(left, right) {
  if (!left.size || !right.size) {
    return 0;
  }
  let intersection = 0;
  for (const item of left) {
    if (right.has(item)) {
      intersection += 1;
    }
  }
  return intersection / (left.size + right.size - intersection);
}

function evidenceQuality(content) {
  const plain = content.replace(/!\[[^\]]*\]\([^)]+\)/gu, ' ').trim();
  if (!plain) {
    return 0.1;
  }
  const imageCount = (content.match(/!\[/gu) || []).length;
  const textRatio = plain.length / Math.max(1, content.length);
  return Math.max(0.25, Math.min(1, textRatio - imageCount * 0.03));
}

function excerptFor(content, terms) {
  const plain = content.replace(/\s+/gu, ' ').trim();
  const normalized = normalize(plain);
  const positions = terms
    .map(({ term }) => normalized.indexOf(term))
    .filter((position) => position >= 0);
  const start = Math.max(
    0,
    (positions.length ? Math.min(...positions) : 0) - 72,
  );
  const end = Math.min(plain.length, start + 360);
  return `${start ? '...' : ''}${plain.slice(start, end)}${
    end < plain.length ? '...' : ''
  }`;
}

function reciprocalRanks(scored, field) {
  const sorted = [...scored].sort(
    (left, right) =>
      right[field] - left[field] ||
      left.chunk.path.localeCompare(right.chunk.path, 'zh-CN'),
  );
  return new Map(
    sorted.map((item, index) => [item.chunk, 1 / (60 + index + 1)]),
  );
}

function rankChunks(query, chunks, config, limit) {
  const terms = expandQuery(query, config.synonymGroups);
  if (!terms.length) {
    return [];
  }
  const queryGrams = characterTrigrams(query);
  const scored = [];
  for (const chunk of chunks) {
    const title = normalize(chunk.headingPath);
    const content = normalize(chunk.content);
    let lexicalScore = 0;
    let matchedPrimaryTerms = 0;
    let primaryTerms = 0;
    for (const { source, term, weight } of terms) {
      const titleHits = Math.min(3, countOccurrences(title, term));
      const contentHits = Math.min(5, countOccurrences(content, term));
      lexicalScore += titleHits * weight * 7 + contentHits * weight * 2;
      if (source === 'token' || source === 'word' || source === 'latin') {
        primaryTerms += 1;
        if (titleHits + contentHits > 0) {
          matchedPrimaryTerms += 1;
        }
      }
    }
    const fuzzyScore = Math.max(
      jaccard(queryGrams, characterTrigrams(chunk.headingPath)),
      jaccard(
        queryGrams,
        characterTrigrams(
          `${chunk.headingPath} ${chunk.content.slice(0, 600)}`,
        ),
      ),
    );
    if (lexicalScore <= 0 && fuzzyScore < 0.08) {
      continue;
    }
    const coverage = primaryTerms ? matchedPrimaryTerms / primaryTerms : 0;
    scored.push({
      chunk,
      coverage,
      fuzzyScore,
      lexicalScore:
        lexicalScore * (0.65 + coverage * 0.7) * evidenceQuality(chunk.content),
    });
  }

  const lexicalRanks = reciprocalRanks(scored, 'lexicalScore');
  const fuzzyRanks = reciprocalRanks(scored, 'fuzzyScore');
  const fused = scored
    .map((item) => ({
      ...item,
      fusedScore:
        (lexicalRanks.get(item.chunk) || 0) * 0.68 +
        (fuzzyRanks.get(item.chunk) || 0) * 0.22 +
        item.coverage * 0.1,
    }))
    .sort(
      (left, right) =>
        right.fusedScore - left.fusedScore ||
        right.lexicalScore - left.lexicalScore ||
        left.chunk.path.localeCompare(right.chunk.path, 'zh-CN'),
    );

  const perDocument = new Map();
  const results = [];
  for (const item of fused) {
    const documentCount = perDocument.get(item.chunk.path) || 0;
    if (documentCount >= Number(config.maxChunksPerDocument || 2)) {
      continue;
    }
    perDocument.set(item.chunk.path, documentCount + 1);
    results.push({
      excerpt: excerptFor(item.chunk.content, terms),
      headingPath: item.chunk.headingPath,
      path: item.chunk.path,
      relativePath: item.chunk.relativePath,
      score: Number(item.fusedScore.toFixed(6)),
    });
    if (results.length >= limit) {
      break;
    }
  }
  return results;
}

export { expandQuery, rankChunks };
