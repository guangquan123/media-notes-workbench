import { execFile } from 'node:child_process';
import {
  mkdir,
  mkdtemp,
  readFile,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const repositoryRoot = process.cwd();
const skillRoot = path.join(
  repositoryRoot,
  '.agents',
  'skills',
  'obsidian-grounded-answer',
);
const routeScript = path.join(skillRoot, 'scripts', 'route-query.mjs');
const searchScript = path.join(skillRoot, 'scripts', 'search-knowledge.mjs');
const evaluationScript = path.join(
  skillRoot,
  'scripts',
  'evaluate-retrieval.mjs',
);
const queryScript = path.join(skillRoot, 'scripts', 'query-knowledge.mjs');
const environmentScript = path.join(
  skillRoot,
  'scripts',
  'check-environment.mjs',
);
const installScript = path.join(skillRoot, 'scripts', 'install-skill.mjs');
const rollbackScript = path.join(skillRoot, 'scripts', 'rollback-install.mjs');

interface SearchResult {
  path: string;
  headingPath: string;
  excerpt: string;
  score: number;
}

interface SearchResponse {
  readOnly: boolean;
  index: {
    added: number;
    changed: number;
    removed: number;
    reused: number;
  };
  results: SearchResult[];
}

async function createFixture(): Promise<{
  configPath: string;
  indexPath: string;
  root: string;
}> {
  const root = await mkdtemp(
    path.join(os.tmpdir(), 'obsidian-grounded-answer-'),
  );
  const configPath = path.join(root, 'knowledge-search.config.json');
  const indexPath = path.join(root, 'knowledge-search.index.json');
  await writeFile(
    configPath,
    JSON.stringify({
      roots: [root],
      excludeRelativePrefixes: ['00_工作台'],
      defaultLimit: 5,
    }),
    'utf8',
  );
  return { configPath, indexPath, root };
}

async function search(
  query: string,
  configPath: string,
  indexPath: string,
): Promise<SearchResponse> {
  const { stdout } = await execFileAsync(
    process.execPath,
    [
      searchScript,
      '--query',
      query,
      '--config',
      configPath,
      '--index',
      indexPath,
      '--limit',
      '5',
    ],
    { cwd: repositoryRoot },
  );
  return JSON.parse(stdout) as SearchResponse;
}

describe('system-level Obsidian retrieval routing', () => {
  it('forces retrieval when the user explicitly references their knowledge base', async () => {
    const { stdout } = await execFileAsync(
      process.execPath,
      [routeScript, '--query', '请参考我的 Obsidian，分析数据治理方案'],
      { cwd: repositoryRoot },
    );

    expect(JSON.parse(stdout)).toMatchObject({
      search: true,
      reason: 'explicit_knowledge_request',
    });
  });

  it('skips a self-contained translation instead of scanning the vault', async () => {
    const { stdout } = await execFileAsync(
      process.execPath,
      [routeScript, '--query', '把 hello 翻译成中文'],
      { cwd: repositoryRoot },
    );

    expect(JSON.parse(stdout)).toMatchObject({
      search: false,
      reason: 'self_contained_request',
    });
  });

  it('retrieves for substantive planning and decision questions', async () => {
    const { stdout } = await execFileAsync(
      process.execPath,
      [routeScript, '--query', '帮我评估这个数据治理项目的风险并给出方案'],
      { cwd: repositoryRoot },
    );

    expect(JSON.parse(stdout)).toMatchObject({
      search: true,
      reason: 'substantive_request',
    });
  });
});

describe('incremental hybrid Obsidian retrieval', () => {
  it('ranks a directly useful evidence note above generic solution documents', async () => {
    const { configPath, indexPath, root } = await createFixture();
    await writeFile(
      path.join(root, '主动检索.md'),
      [
        '# Obsidian 主动检索',
        '',
        '## 作为解决方案的补充证据',
        '',
        '回答问题时先走原有分析，再检索个人知识库。',
        '知识库只能补充解决方案，并且必须标记原文路径和摘录。',
      ].join('\n'),
      'utf8',
    );
    await writeFile(
      path.join(root, '通用方案.md'),
      [
        '# 解决方案模板',
        '',
        '解决方案、解决方案、解决方案。',
        '这是一个没有涉及知识检索或证据引用的通用模板。',
      ].join('\n'),
      'utf8',
    );

    const result = await search(
      '如何用知识库补充我的解决方案',
      configPath,
      indexPath,
    );

    expect(result.results[0]).toMatchObject({
      headingPath: 'Obsidian 主动检索 > 作为解决方案的补充证据',
    });
    expect(result.results[0].excerpt).toContain('个人知识库');
  });

  it('prefers coverage of distinct Chinese concepts over one repeated broad term', async () => {
    const { configPath, indexPath, root } = await createFixture();
    await writeFile(
      path.join(root, '治理概念.md'),
      '# 数据治理\n\n数据治理、数据治理、数据治理是管理体系。',
      'utf8',
    );
    await writeFile(
      path.join(root, '字段核验.md'),
      [
        '# 字段映射核验',
        '',
        '数据治理实施时，需要核验源系统和目标系统的字段映射关系。',
      ].join('\n'),
      'utf8',
    );

    const result = await search('数据治理字段映射核验', configPath, indexPath);

    expect(result.results[0].path).toContain('字段核验.md');
  });

  it('reuses unchanged indexed documents and refreshes changed content by hash', async () => {
    const { configPath, indexPath, root } = await createFixture();
    const notePath = path.join(root, '字段核验.md');
    await writeFile(notePath, '# 字段核验\n\n同步前检查字段映射。', 'utf8');

    const first = await search('字段映射', configPath, indexPath);
    const second = await search('字段映射', configPath, indexPath);
    await writeFile(
      notePath,
      '# 字段核验\n\n同步前检查字段映射和责任人。',
      'utf8',
    );
    const third = await search('责任人', configPath, indexPath);

    expect(first.index.added).toBe(1);
    expect(second.index.reused).toBe(1);
    expect(second.index.changed).toBe(0);
    expect(third.index.changed).toBe(1);
    expect(third.results[0].excerpt).toContain('责任人');
  });

  it('removes deleted notes from the index without writing into the vault', async () => {
    const { configPath, indexPath, root } = await createFixture();
    const sourceDirectory = path.join(root, '01_知识资产');
    const excludedDirectory = path.join(root, '00_工作台');
    await mkdir(sourceDirectory);
    await mkdir(excludedDirectory);
    const notePath = path.join(sourceDirectory, '核验.md');
    await writeFile(notePath, '# 核验\n\n字段映射核验。', 'utf8');
    await writeFile(
      path.join(excludedDirectory, '日志.md'),
      '# 核验\n\n字段映射核验。',
      'utf8',
    );
    const before = await stat(notePath);

    await search('字段映射', configPath, indexPath);
    await unlink(notePath);
    const afterDeletion = await search('字段映射', configPath, indexPath);

    expect(before.isFile()).toBe(true);
    expect(afterDeletion.index.removed).toBe(1);
    expect(
      afterDeletion.results.some((item) => item.path.includes('00_工作台')),
    ).toBe(false);
    await expect(readFile(indexPath, 'utf8')).resolves.toContain(
      '"schemaVersion"',
    );
  });
});

describe('retrieval evaluation', () => {
  it('reports top-k hit rate from auditable expected path patterns', async () => {
    const { configPath, indexPath, root } = await createFixture();
    await writeFile(
      path.join(root, '数据质量.md'),
      '# 数据质量\n\n## 字段映射\n\n同步前必须核验字段映射。',
      'utf8',
    );
    const casesPath = path.join(root, 'evaluation-cases.json');
    await writeFile(
      casesPath,
      JSON.stringify([
        {
          query: '同步前如何检查字段',
          expectedPathPattern: '数据质量.md',
        },
      ]),
      'utf8',
    );

    const { stdout } = await execFileAsync(
      process.execPath,
      [
        evaluationScript,
        '--cases',
        casesPath,
        '--config',
        configPath,
        '--index',
        indexPath,
        '--top-k',
        '3',
      ],
      { cwd: repositoryRoot },
    );

    expect(JSON.parse(stdout)).toMatchObject({
      totalCases: 1,
      passedCases: 1,
      topKHitRate: 1,
    });
  });
});

describe('portable Skill launcher and installation', () => {
  it('uses only the approved environment configuration and index', async () => {
    const { configPath, indexPath, root } = await createFixture();
    const notePath = path.join(root, '项目复盘.md');
    await writeFile(notePath, '# 项目复盘\n\n风险评估必须关联责任人。', 'utf8');

    const { stdout } = await execFileAsync(
      process.execPath,
      [queryScript, '--query', '项目风险责任人'],
      {
        cwd: repositoryRoot,
        env: {
          ...process.env,
          KNOWLEDGE_SEARCH_CONFIG: configPath,
          KNOWLEDGE_SEARCH_INDEX: indexPath,
        },
      },
    );
    const result = JSON.parse(stdout) as SearchResponse;

    expect(result.results[0].path).toBe(notePath);
    await expect(
      execFileAsync(
        process.execPath,
        [queryScript, '--query', '风险', '--config', configPath],
        { cwd: repositoryRoot },
      ),
    ).rejects.toThrow('Use KNOWLEDGE_SEARCH_CONFIG');
  });

  it('checks every configured root and the separate writable index directory', async () => {
    const { configPath, indexPath, root } = await createFixture();

    const { stdout } = await execFileAsync(
      process.execPath,
      [environmentScript],
      {
        cwd: repositoryRoot,
        env: {
          ...process.env,
          KNOWLEDGE_SEARCH_CONFIG: configPath,
          KNOWLEDGE_SEARCH_INDEX: indexPath,
        },
      },
    );

    expect(JSON.parse(stdout)).toMatchObject({
      indexPath,
      readOnlyVault: true,
      ready: true,
      roots: [{ path: root, readable: true }],
    });
  });

  it('installs idempotently for Codex and WorkBuddy and adds one global trigger block', async () => {
    const fixtureHome = await mkdtemp(
      path.join(os.tmpdir(), 'obsidian-skill-install-'),
    );
    const codexSkills = path.join(fixtureHome, 'codex-skills');
    const workbuddySkills = path.join(fixtureHome, 'workbuddy-skills');
    const globalAgents = path.join(fixtureHome, 'AGENTS.md');
    const backupRoot = path.join(fixtureHome, 'backups');
    await writeFile(globalAgents, '# Existing global rules\n', 'utf8');

    const args = [
      installScript,
      '--codex-skills-dir',
      codexSkills,
      '--workbuddy-skills-dir',
      workbuddySkills,
      '--global-agents',
      globalAgents,
      '--backup-root',
      backupRoot,
      '--yes',
    ];
    const first = JSON.parse(
      (await execFileAsync(process.execPath, args, { cwd: repositoryRoot }))
        .stdout,
    );
    const second = JSON.parse(
      (await execFileAsync(process.execPath, args, { cwd: repositoryRoot }))
        .stdout,
    );
    const globalRules = await readFile(globalAgents, 'utf8');

    expect(first.changed).toBe(true);
    expect(second.changed).toBe(false);
    expect(globalRules.match(/BEGIN OBSIDIAN GROUNDED ANSWER/gu)).toHaveLength(
      1,
    );
    await expect(
      stat(path.join(codexSkills, 'obsidian-grounded-answer', 'SKILL.md')),
    ).resolves.toBeDefined();
    await expect(
      stat(path.join(workbuddySkills, 'obsidian-grounded-answer', 'SKILL.md')),
    ).resolves.toBeDefined();

    const rollback = JSON.parse(
      (
        await execFileAsync(
          process.execPath,
          [rollbackScript, '--manifest', first.manifestPath, '--yes'],
          { cwd: repositoryRoot },
        )
      ).stdout,
    );

    expect(rollback.changed).toBe(true);
    await expect(readFile(globalAgents, 'utf8')).resolves.toBe(
      '# Existing global rules\n',
    );
    await expect(
      stat(path.join(codexSkills, 'obsidian-grounded-answer')),
    ).rejects.toThrow();
    await expect(
      stat(path.join(workbuddySkills, 'obsidian-grounded-answer')),
    ).rejects.toThrow();
  });
});
