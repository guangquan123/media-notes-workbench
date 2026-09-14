#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { resolveRuntimePaths } = require('./runtime-paths.js');

const MIGRATION_VERSION = 1;
const CONFIG_FILE_NAMES = [
  '.connector-config.json',
  '.env.local',
  '.external-model-config.json',
  '.media-cleanup-config.json',
  '.media-cleanup-history.json',
  '.media-inbox-state.json',
  '.model-provider-config.json',
  '.minutes-transcription-state.json',
  '.recording-assets.json',
  '.recording-storage-settings.json',
  '.runtime-config.json',
  '.task-notification-config.json',
  '.tencent-asr-config.json',
];

function pathEquals(left, right) {
  const normalizedLeft = path.resolve(left);
  const normalizedRight = path.resolve(right);
  return process.platform === 'win32'
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}

function pathStartsWith(candidate, root) {
  const normalizedCandidate = path.resolve(candidate);
  const normalizedRoot = path.resolve(root);
  const left =
    process.platform === 'win32'
      ? normalizedCandidate.toLowerCase()
      : normalizedCandidate;
  const right =
    process.platform === 'win32'
      ? normalizedRoot.toLowerCase()
      : normalizedRoot;
  return left === right || left.startsWith(`${right}${path.sep}`);
}

function collectTreeSummary(targetPath) {
  if (!fs.existsSync(targetPath)) return { bytes: 0, files: 0 };
  const stat = fs.lstatSync(targetPath);
  if (!stat.isDirectory()) return { bytes: stat.size, files: 1 };
  return fs.readdirSync(targetPath).reduce(
    (summary, name) => {
      const child = collectTreeSummary(path.join(targetPath, name));
      return {
        bytes: summary.bytes + child.bytes,
        files: summary.files + child.files,
      };
    },
    { bytes: 0, files: 0 },
  );
}

function addEntry(entries, source, target, label) {
  if (pathEquals(source, target)) return;
  entries.push({ label, source, target });
}

function buildMigrationEntries(sourceRoot, targetPaths) {
  const entries = [];
  for (const fileName of CONFIG_FILE_NAMES) {
    addEntry(
      entries,
      path.join(sourceRoot, fileName),
      path.join(targetPaths.configDir, fileName),
      `config/${fileName}`,
    );
    addEntry(
      entries,
      path.join(sourceRoot, 'config', fileName),
      path.join(targetPaths.configDir, fileName),
      `config-subdir/${fileName}`,
    );
  }

  addEntry(entries, path.join(sourceRoot, 'data'), targetPaths.dataDir, 'data');
  for (const directory of [
    'pgdata',
    'recording-playable',
    'recordings',
    'uploads',
    'models',
    '.media-cleanup-quarantine',
    'storage',
  ]) {
    addEntry(
      entries,
      path.join(sourceRoot, directory),
      path.join(targetPaths.dataDir, directory),
      `data/${directory}`,
    );
  }
  return entries;
}

function copyFileAtomically(source, target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporaryPath = `${target}.${process.pid}.migrating.tmp`;
  if (fs.existsSync(temporaryPath)) {
    throw new Error(`迁移临时文件已存在，请先确认后再重试: ${temporaryPath}`);
  }
  fs.copyFileSync(source, temporaryPath);
  replaceTemporaryFile(temporaryPath, target);
}

function replaceTemporaryFile(temporaryPath, target) {
  try {
    fs.renameSync(temporaryPath, target);
  } catch (error) {
    if (error?.code !== 'EBADF') throw error;
    fs.copyFileSync(temporaryPath, target);
    fs.rmSync(temporaryPath, { force: true });
  }
}

function copyTree(source, target, result) {
  const sourceStat = fs.lstatSync(source);
  if (sourceStat.isDirectory()) {
    fs.mkdirSync(target, { recursive: true });
    for (const name of fs.readdirSync(source)) {
      copyTree(path.join(source, name), path.join(target, name), result);
    }
    return;
  }

  if (fs.existsSync(target)) {
    const targetStat = fs.lstatSync(target);
    if (targetStat.isDirectory()) {
      result.conflicts.push(`目标类型冲突: ${target}`);
      return;
    }
    if (
      targetStat.size === sourceStat.size &&
      fs.readFileSync(source).equals(fs.readFileSync(target))
    ) {
      result.skippedFiles += 1;
      return;
    }
    result.conflicts.push(`目标文件已存在，未覆盖: ${target}`);
    return;
  }
  copyFileAtomically(source, target);
  result.copiedFiles += 1;
}

function rewriteKnownPath(value, mappings) {
  if (typeof value !== 'string' || !path.isAbsolute(value)) return value;
  const sourcePath = path.resolve(value);
  const mapping = mappings.find(({ source }) =>
    pathStartsWith(sourcePath, source),
  );
  if (!mapping) return value;
  const relative = path.relative(mapping.source, sourcePath);
  return path.resolve(mapping.target, relative);
}

function rewriteDocument(value, mappings) {
  if (Array.isArray(value)) {
    return value.map((item) => rewriteDocument(item, mappings));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        rewriteDocument(item, mappings),
      ]),
    );
  }
  return rewriteKnownPath(value, mappings);
}

function rewriteJsonFile(filePath, mappings) {
  if (!fs.existsSync(filePath)) return false;
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`迁移配置文件无法解析: ${filePath}`, { cause: error });
  }
  const rewritten = rewriteDocument(parsed, mappings);
  const next = `${JSON.stringify(rewritten, null, 2)}\n`;
  const current = fs.readFileSync(filePath, 'utf8');
  if (current === next) return false;
  copyFileAtomicallyFromContent(next, filePath);
  return true;
}

function copyFileAtomicallyFromContent(content, target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temporaryPath = `${target}.${process.pid}.migrating.tmp`;
  if (fs.existsSync(temporaryPath)) {
    throw new Error(`迁移临时文件已存在，请先确认后再重试: ${temporaryPath}`);
  }
  fs.writeFileSync(temporaryPath, content, 'utf8');
  replaceTemporaryFile(temporaryPath, target);
}

function migrateLocalRuntime(options = {}) {
  const targetPaths =
    options.targetPaths ||
    resolveRuntimePaths({
      cwd: options.appRoot,
      env: options.env || process.env,
    });
  const sourceRoot = path.resolve(options.sourceRoot || targetPaths.appRoot);
  const markerPath = path.join(targetPaths.stateDir, 'layout-migration.json');
  if (!options.dryRun && fs.existsSync(markerPath)) {
    return {
      markerPath,
      status: 'skipped',
      sourceRoot,
      targetHome: targetPaths.homeDir,
    };
  }

  const entries = buildMigrationEntries(sourceRoot, targetPaths);
  const result = {
    conflicts: [],
    copiedFiles: 0,
    markerPath,
    rewrittenFiles: [],
    skippedFiles: 0,
    sourceRoot,
    status: 'noop',
    targetHome: targetPaths.homeDir,
  };
  const mappings = [
    { source: path.join(sourceRoot, 'data'), target: targetPaths.dataDir },
    {
      source: path.join(sourceRoot, 'pgdata'),
      target: path.join(targetPaths.dataDir, 'pgdata'),
    },
    {
      source: path.join(sourceRoot, 'uploads'),
      target: path.join(targetPaths.dataDir, 'uploads'),
    },
    {
      source: path.join(sourceRoot, 'recordings'),
      target: path.join(targetPaths.dataDir, 'recordings'),
    },
    {
      source: path.join(sourceRoot, 'recording-playable'),
      target: path.join(targetPaths.dataDir, 'recording-playable'),
    },
    {
      source: path.join(sourceRoot, 'models'),
      target: path.join(targetPaths.dataDir, 'models'),
    },
    { source: path.join(sourceRoot, 'config'), target: targetPaths.configDir },
  ].sort((left, right) => right.source.length - left.source.length);

  for (const entry of entries) {
    if (!fs.existsSync(entry.source)) continue;
    if (options.dryRun) {
      result.status = 'migrated';
      continue;
    }
    const before = collectTreeSummary(entry.source);
    copyTree(entry.source, entry.target, result);
    const after = collectTreeSummary(entry.target);
    if (before.files !== after.files || before.bytes > after.bytes) {
      result.conflicts.push(`迁移校验失败: ${entry.label}`);
    }
  }

  if (result.conflicts.length > 0) {
    result.status = 'conflict';
    return result;
  }
  if (options.dryRun) return result;

  for (const fileName of [
    '.recording-assets.json',
    '.recording-storage-settings.json',
  ]) {
    const filePath = path.join(targetPaths.configDir, fileName);
    if (rewriteJsonFile(filePath, mappings))
      result.rewrittenFiles.push(fileName);
  }
  if (result.copiedFiles > 0 || result.rewrittenFiles.length > 0) {
    result.status = 'migrated';
  }
  fs.mkdirSync(targetPaths.stateDir, { recursive: true });
  copyFileAtomicallyFromContent(
    `${JSON.stringify(
      {
        completedAt: new Date().toISOString(),
        sourceRoot,
        targetHome: targetPaths.homeDir,
        version: MIGRATION_VERSION,
      },
      null,
      2,
    )}\n`,
    markerPath,
  );
  return result;
}

function getOption(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

if (require.main === module) {
  const environment = { ...process.env };
  const targetPaths = resolveRuntimePaths({ env: environment });
  const result = migrateLocalRuntime({
    dryRun: process.argv.includes('--dry-run'),
    sourceRoot: getOption('--source') || environment.WORKBENCH_LEGACY_ROOT,
    targetPaths,
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exitCode = result.status === 'conflict' ? 2 : 0;
}

module.exports = {
  buildMigrationEntries,
  migrateLocalRuntime,
  rewriteDocument,
};
