import { createHash } from 'node:crypto';
import {
  cp,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  stat,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const BLOCK_START = '<!-- BEGIN OBSIDIAN GROUNDED ANSWER -->';
const BLOCK_END = '<!-- END OBSIDIAN GROUNDED ANSWER -->';

function parseArgs(args) {
  const parsed = {};
  const supported = new Set([
    '--backup-root',
    '--codex-skills-dir',
    '--global-agents',
    '--workbuddy-skills-dir',
    '--yes',
  ]);
  for (let index = 0; index < args.length; index += 1) {
    const option = args[index];
    if (!supported.has(option)) {
      throw new Error(`Unsupported option: ${option}`);
    }
    if (option === '--yes') {
      parsed.yes = true;
      continue;
    }
    const value = args[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`${option} requires a value`);
    }
    parsed[option.slice(2)] = value;
    index += 1;
  }
  if (!parsed.yes) {
    throw new Error(
      'Installation writes user-level files; pass --yes to confirm',
    );
  }
  return parsed;
}

async function pathExists(target) {
  try {
    await stat(target);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

async function hashDirectory(root) {
  if (!(await pathExists(root))) {
    return null;
  }
  const hash = createHash('sha256');
  async function visit(directory, relativeDirectory = '') {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
      const relativePath = path.join(relativeDirectory, entry.name);
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        await visit(target, relativePath);
      } else if (entry.isFile()) {
        hash.update(relativePath);
        hash.update(await readFile(target));
      }
    }
  }
  await visit(root);
  return hash.digest('hex');
}

function globalRuleBlock(codexSkillPath) {
  const routeScript = path.join(codexSkillPath, 'scripts', 'route-query.mjs');
  const queryScript = path.join(
    codexSkillPath,
    'scripts',
    'query-knowledge.mjs',
  );
  return [
    BLOCK_START,
    '## System-level Obsidian supplementary retrieval',
    '',
    'For each user request, first decide whether local knowledge has expected value:',
    '',
    `1. Run \`node "${routeScript}" --query "<user request>"\`.`,
    `2. When \`search\` is true, run \`node "${queryScript}" --query "<user request>" --limit 8\` before reaching conclusions.`,
    '3. Current request, system, code, data, and applicable standards remain the primary evidence. Obsidian is supplementary only.',
    '4. Label only used hits as `【来自我的知识库】` and cite `path`, `headingPath`, and `excerpt`.',
    '5. A non-hit never proves that a fact, risk, or solution does not exist.',
    '6. Retrieval must never write, move, rename, or delete Obsidian Markdown.',
    '7. Skip only when the router returns false or the user explicitly opts out.',
    BLOCK_END,
  ].join('\n');
}

function mergeGlobalRules(current, block) {
  const startIndex = current.indexOf(BLOCK_START);
  const endIndex = current.indexOf(BLOCK_END);
  if (startIndex >= 0 && endIndex >= startIndex) {
    const after = endIndex + BLOCK_END.length;
    return `${current.slice(0, startIndex)}${block}${current.slice(after)}`;
  }
  return `${current.trimEnd()}\n\n${block}\n`;
}

async function installDirectory({ backupDirectory, label, source, target }) {
  const [sourceHash, targetHash] = await Promise.all([
    hashDirectory(source),
    hashDirectory(target),
  ]);
  if (sourceHash === targetHash) {
    return { changed: false, label, target };
  }
  await mkdir(path.dirname(target), { recursive: true });
  const staging = await mkdtemp(
    path.join(path.dirname(target), '.obsidian-grounded-answer-stage-'),
  );
  await cp(source, staging, { recursive: true });
  let backupPath = null;
  if (await pathExists(target)) {
    await mkdir(backupDirectory, { recursive: true });
    backupPath = path.join(backupDirectory, `${label}-skill`);
    await rename(target, backupPath);
  }
  await rename(staging, target);
  return { backupPath, changed: true, label, target };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const home = os.homedir();
  const source = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '..',
  );
  const codexSkillsDirectory = path.resolve(
    options['codex-skills-dir'] || path.join(home, '.codex', 'skills'),
  );
  const workbuddySkillsDirectory = path.resolve(
    options['workbuddy-skills-dir'] || path.join(home, '.workbuddy', 'skills'),
  );
  const globalAgentsPath = path.resolve(
    options['global-agents'] || path.join(home, '.codex', 'AGENTS.md'),
  );
  const backupRoot = path.resolve(
    options['backup-root'] ||
      path.join(home, '.codex', 'backups', 'obsidian-grounded-answer'),
  );
  const runId = new Date().toISOString().replace(/[:.]/gu, '-');
  const backupDirectory = path.join(backupRoot, runId);
  const codexTarget = path.join(
    codexSkillsDirectory,
    'obsidian-grounded-answer',
  );
  const workbuddyTarget = path.join(
    workbuddySkillsDirectory,
    'obsidian-grounded-answer',
  );
  const installations = [];
  installations.push(
    await installDirectory({
      backupDirectory,
      label: 'codex',
      source,
      target: codexTarget,
    }),
  );
  installations.push(
    await installDirectory({
      backupDirectory,
      label: 'workbuddy',
      source,
      target: workbuddyTarget,
    }),
  );

  const currentGlobalRules = (await pathExists(globalAgentsPath))
    ? await readFile(globalAgentsPath, 'utf8')
    : '';
  const nextGlobalRules = mergeGlobalRules(
    currentGlobalRules,
    globalRuleBlock(codexTarget),
  );
  let globalRulesChanged = false;
  let globalRulesBackup = null;
  if (currentGlobalRules !== nextGlobalRules) {
    await mkdir(backupDirectory, { recursive: true });
    if (currentGlobalRules) {
      globalRulesBackup = path.join(backupDirectory, 'AGENTS.md');
      await writeFile(globalRulesBackup, currentGlobalRules, 'utf8');
    }
    await mkdir(path.dirname(globalAgentsPath), { recursive: true });
    await writeFile(globalAgentsPath, nextGlobalRules, 'utf8');
    globalRulesChanged = true;
  }

  const changed =
    globalRulesChanged || installations.some((item) => item.changed);
  let manifestPath = null;
  if (changed) {
    await mkdir(backupDirectory, { recursive: true });
    manifestPath = path.join(backupDirectory, 'install-manifest.json');
    await writeFile(
      manifestPath,
      `${JSON.stringify(
        {
          globalAgentsPath,
          globalRulesBackup,
          installations,
          runId,
        },
        null,
        2,
      )}\n`,
      'utf8',
    );
  }
  process.stdout.write(
    `${JSON.stringify(
      {
        changed,
        globalRules: {
          changed: globalRulesChanged,
          path: globalAgentsPath,
        },
        installations,
        manifestPath,
      },
      null,
      2,
    )}\n`,
  );
}

main().catch((error) => {
  process.stderr.write(`${error.stack || error.message}\n`);
  process.exitCode = 1;
});
