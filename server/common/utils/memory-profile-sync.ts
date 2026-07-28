import { createHash } from 'node:crypto';
import type { Dirent } from 'node:fs';
import {
  copyFile,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';

const MANAGED_BLOCK_START: string = '<!-- BEGIN CODEX MEMORY SYNC -->';
const MANAGED_BLOCK_END: string = '<!-- END CODEX MEMORY SYNC -->';
const MANIFEST_NAME: string = 'sync-manifest.json';
const README_NAME: string = 'README.md';
const SOURCE_DIRECTORY_NAME: string = 'source';

interface MemorySourceFile {
  absolutePath: string;
  modifiedAt: string;
  path: string;
  sha256: string;
  size: number;
}

interface MemorySyncManifest {
  explicitPreferenceCount: number;
  files: Array<{
    modifiedAt: string;
    path: string;
    sha256: string;
    size: number;
  }>;
  generatedAt: string;
  profilePath: string;
  rolloutSummaryCount: number;
  schemaVersion: 1;
  sourceDigest: string;
  sourceFileCount: number;
  sourceRoot: string;
  targetRoot: string;
  totalBytes: number;
}

interface MemorySyncOptions {
  now?: Date;
  profilePath: string;
  sourceRoot: string;
  targetRoot: string;
}

interface MemorySyncResult {
  explicitPreferenceCount: number;
  rolloutSummaryCount: number;
  sourceDigest: string;
  sourceFileCount: number;
  status: 'unchanged' | 'updated';
  totalBytes: number;
}

function sha256(content: Buffer | string): string {
  return createHash('sha256').update(content).digest('hex');
}

function hasErrorCode(error: unknown, expectedCode: string): boolean {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return false;
  }
  return error.code === expectedCode;
}

function assertSafeRoots(sourceRoot: string, targetRoot: string): void {
  const normalizedSourceRoot: string = resolve(sourceRoot);
  const normalizedTargetRoot: string = resolve(targetRoot);
  const targetRelativeToSource: string = relative(
    normalizedSourceRoot,
    normalizedTargetRoot,
  );
  const sourceRelativeToTarget: string = relative(
    normalizedTargetRoot,
    normalizedSourceRoot,
  );

  if (
    normalizedSourceRoot === normalizedTargetRoot ||
    (!targetRelativeToSource.startsWith(`..${sep}`) &&
      targetRelativeToSource !== '..') ||
    (!sourceRelativeToTarget.startsWith(`..${sep}`) &&
      sourceRelativeToTarget !== '..')
  ) {
    throw new Error('Memory source and target must not contain each other');
  }
}

async function collectMemoryFiles(
  sourceRoot: string,
): Promise<MemorySourceFile[]> {
  const collectedFiles: MemorySourceFile[] = [];

  async function visit(directoryPath: string): Promise<void> {
    const directoryEntries: Dirent<string>[] = await readdir(directoryPath, {
      encoding: 'utf8',
      withFileTypes: true,
    });
    directoryEntries.sort(
      (left: Dirent<string>, right: Dirent<string>): number =>
        left.name.localeCompare(right.name),
    );

    for (const directoryEntry of directoryEntries) {
      if (directoryEntry.name === '.git') {
        continue;
      }
      const absolutePath: string = join(directoryPath, directoryEntry.name);
      if (directoryEntry.isDirectory()) {
        await visit(absolutePath);
        continue;
      }
      if (!directoryEntry.isFile()) {
        continue;
      }

      const content: Buffer = await readFile(absolutePath);
      const fileStats: Awaited<ReturnType<typeof stat>> =
        await stat(absolutePath);
      collectedFiles.push({
        absolutePath,
        modifiedAt: fileStats.mtime.toISOString(),
        path: relative(sourceRoot, absolutePath).split(sep).join('/'),
        sha256: sha256(content),
        size: fileStats.size,
      });
    }
  }

  await visit(sourceRoot);
  return collectedFiles.sort(
    (left: MemorySourceFile, right: MemorySourceFile): number =>
      left.path.localeCompare(right.path),
  );
}

function calculateSourceDigest(sourceFiles: MemorySourceFile[]): string {
  const digestInput: string = sourceFiles
    .map(
      (sourceFile: MemorySourceFile): string =>
        `${sourceFile.path}\0${sourceFile.sha256}\0${sourceFile.size}`,
    )
    .join('\n');
  return sha256(digestInput);
}

function countFilesWithPrefix(
  sourceFiles: MemorySourceFile[],
  prefix: string,
): number {
  return sourceFiles.filter((sourceFile: MemorySourceFile): boolean =>
    sourceFile.path.startsWith(prefix),
  ).length;
}

function buildManifest(
  options: Required<MemorySyncOptions>,
  sourceFiles: MemorySourceFile[],
  sourceDigest: string,
): MemorySyncManifest {
  const explicitPreferenceCount: number = countFilesWithPrefix(
    sourceFiles,
    'extensions/ad_hoc/notes/',
  );
  const rolloutSummaryCount: number = countFilesWithPrefix(
    sourceFiles,
    'rollout_summaries/',
  );
  const totalBytes: number = sourceFiles.reduce(
    (sum: number, sourceFile: MemorySourceFile): number =>
      sum + sourceFile.size,
    0,
  );

  return {
    explicitPreferenceCount,
    files: sourceFiles.map(
      (sourceFile: MemorySourceFile): MemorySyncManifest['files'][number] => ({
        modifiedAt: sourceFile.modifiedAt,
        path: sourceFile.path,
        sha256: sourceFile.sha256,
        size: sourceFile.size,
      }),
    ),
    generatedAt: options.now.toISOString(),
    profilePath: options.profilePath,
    rolloutSummaryCount,
    schemaVersion: 1,
    sourceDigest,
    sourceFileCount: sourceFiles.length,
    sourceRoot: options.sourceRoot,
    targetRoot: options.targetRoot,
    totalBytes,
  };
}

function buildReadme(manifest: MemorySyncManifest): string {
  return `---
title: Codex 私人长期记忆镜像
updated: ${manifest.generatedAt}
status: private
source_digest: ${manifest.sourceDigest}
---

# Codex 私人长期记忆镜像

> **私人资料：不要公开发布、上传到公共仓库或分享给无关人员。**

这里是 Codex 机器侧长期记忆的单向只读镜像，用于让你在 Obsidian /
Typora 中查看自己的用户画像、长期偏好、历史任务摘要和记忆证据。

## 当前状态

- 最近同步：${manifest.generatedAt}
- 源文件：${manifest.sourceFileCount}
- 显式偏好：${manifest.explicitPreferenceCount}
- 历史任务摘要：${manifest.rolloutSummaryCount}
- 总字节数：${manifest.totalBytes}
- 源状态摘要：\`${manifest.sourceDigest}\`

## 目录说明

- [当前压缩画像与偏好](source/memory_summary.md)
- [详细记忆索引](source/MEMORY.md)
- [原始记忆材料](source/raw_memories.md)
- [显式偏好目录](source/extensions/ad_hoc/notes)
- [历史任务摘要目录](source/rollout_summaries)
- [同步清单](sync-manifest.json)

## 同步规则

1. Codex 记忆库是事实源，本目录只做单向镜像。
2. 不在本目录反向编辑 Codex 记忆；新增长期偏好仍写入 Codex 的
   \`extensions/ad_hoc/notes/\`。
3. \`memory_summary.md\` 和 \`MEMORY.md\` 可能晚于最新显式偏好完成系统整合；
   此时以 \`source/extensions/ad_hoc/notes/\` 的新增说明为补充依据。
4. 同步使用文件内容 SHA-256，而不是仅依赖修改时间；源内容不变时不会重写镜像。
5. \`source/\` 是同步程序管理的目录，不要在其中保存人工笔记。
`;
}

function buildProfileBlock(manifest: MemorySyncManifest): string {
  return `${MANAGED_BLOCK_START}
## 十四、Codex 长期记忆联动

本画像已与 Codex 的私人长期记忆建立单向镜像。机器侧记忆仍是事实源，
本目录用于人工查看、校准和审计，不从 Obsidian 反向覆盖 Codex 记忆。

- 最近同步：${manifest.generatedAt}
- 源文件：${manifest.sourceFileCount}
- 显式偏好：${manifest.explicitPreferenceCount}
- 历史任务摘要：${manifest.rolloutSummaryCount}
- 源状态摘要：\`${manifest.sourceDigest}\`
- 镜像入口：[[01_Codex长期记忆镜像/README]]

说明：系统压缩摘要可能晚于最新显式偏好完成整合；镜像会同时保留汇总索引、
原始材料和显式偏好，避免把“尚未汇总”误判为“尚未记录”。
${MANAGED_BLOCK_END}`;
}

function replaceManagedProfileBlock(
  currentProfile: string,
  managedBlock: string,
): string {
  const startIndex: number = currentProfile.indexOf(MANAGED_BLOCK_START);
  const endIndex: number = currentProfile.indexOf(MANAGED_BLOCK_END);

  if (startIndex === -1 && endIndex === -1) {
    return `${currentProfile.trimEnd()}\n\n---\n\n${managedBlock}\n`;
  }
  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    throw new Error('Profile contains an incomplete Codex memory sync block');
  }

  const blockEndIndex: number = endIndex + MANAGED_BLOCK_END.length;
  return `${currentProfile.slice(0, startIndex)}${managedBlock}${currentProfile
    .slice(blockEndIndex)
    .replace(/^\n*/u, '\n')}`;
}

async function readManifest(
  manifestPath: string,
): Promise<MemorySyncManifest | null> {
  try {
    return JSON.parse(
      await readFile(manifestPath, 'utf8'),
    ) as MemorySyncManifest;
  } catch (error: unknown) {
    if (hasErrorCode(error, 'ENOENT')) {
      return null;
    }
    throw error;
  }
}

async function mirrorIsComplete(
  targetRoot: string,
  sourceFiles: MemorySourceFile[],
): Promise<boolean> {
  try {
    for (const sourceFile of sourceFiles) {
      const mirroredContent: Buffer = await readFile(
        join(targetRoot, SOURCE_DIRECTORY_NAME, sourceFile.path),
      );
      if (sha256(mirroredContent) !== sourceFile.sha256) {
        return false;
      }
    }
    await readFile(join(targetRoot, README_NAME), 'utf8');
    return true;
  } catch (error: unknown) {
    if (hasErrorCode(error, 'ENOENT')) {
      return false;
    }
    throw error;
  }
}

async function writeFileAtomically(
  targetPath: string,
  content: string,
): Promise<void> {
  await mkdir(dirname(targetPath), { recursive: true });
  const temporaryPath: string = `${targetPath}.tmp-${process.pid}`;
  await writeFile(temporaryPath, content, 'utf8');
  await rename(temporaryPath, targetPath);
}

async function replaceSourceMirror(
  targetRoot: string,
  sourceFiles: MemorySourceFile[],
): Promise<void> {
  const sourceMirrorPath: string = join(targetRoot, SOURCE_DIRECTORY_NAME);
  const stagePath: string = join(
    targetRoot,
    `.source-stage-${process.pid}-${Date.now()}`,
  );
  const previousPath: string = join(
    targetRoot,
    `.source-previous-${process.pid}-${Date.now()}`,
  );
  let previousMoved: boolean = false;

  await mkdir(stagePath, { recursive: true });
  try {
    for (const sourceFile of sourceFiles) {
      const stagedPath: string = join(stagePath, sourceFile.path);
      await mkdir(dirname(stagedPath), { recursive: true });
      await copyFile(sourceFile.absolutePath, stagedPath);
    }

    try {
      await rename(sourceMirrorPath, previousPath);
      previousMoved = true;
    } catch (error: unknown) {
      if (!hasErrorCode(error, 'ENOENT')) {
        throw error;
      }
    }

    await rename(stagePath, sourceMirrorPath);
    if (previousMoved) {
      await rm(previousPath, { force: true, recursive: true });
    }
  } catch (error: unknown) {
    await rm(stagePath, { force: true, recursive: true });
    if (previousMoved) {
      try {
        await rename(previousPath, sourceMirrorPath);
      } catch {
        // The new mirror is already in place; the next run will verify it.
      }
    }
    throw error;
  }
}

async function syncMemoryProfile(
  syncOptions: MemorySyncOptions,
): Promise<MemorySyncResult> {
  const options: Required<MemorySyncOptions> = {
    now: syncOptions.now ?? new Date(),
    profilePath: resolve(syncOptions.profilePath),
    sourceRoot: resolve(syncOptions.sourceRoot),
    targetRoot: resolve(syncOptions.targetRoot),
  };
  assertSafeRoots(options.sourceRoot, options.targetRoot);

  const sourceFiles: MemorySourceFile[] = await collectMemoryFiles(
    options.sourceRoot,
  );
  if (sourceFiles.length === 0) {
    throw new Error('Memory source contains no files');
  }

  const sourceDigest: string = calculateSourceDigest(sourceFiles);
  const manifest: MemorySyncManifest = buildManifest(
    options,
    sourceFiles,
    sourceDigest,
  );
  const existingManifest: MemorySyncManifest | null = await readManifest(
    join(options.targetRoot, MANIFEST_NAME),
  );
  const currentProfile: string = await readFile(options.profilePath, 'utf8');
  const managedBlock: string = buildProfileBlock(manifest);
  const profileHasCurrentBlock: boolean = currentProfile.includes(
    `源状态摘要：\`${sourceDigest}\``,
  );
  const completeMirror: boolean = await mirrorIsComplete(
    options.targetRoot,
    sourceFiles,
  );

  if (
    existingManifest?.sourceDigest === sourceDigest &&
    completeMirror &&
    profileHasCurrentBlock
  ) {
    return {
      explicitPreferenceCount: manifest.explicitPreferenceCount,
      rolloutSummaryCount: manifest.rolloutSummaryCount,
      sourceDigest,
      sourceFileCount: manifest.sourceFileCount,
      status: 'unchanged',
      totalBytes: manifest.totalBytes,
    };
  }

  await mkdir(options.targetRoot, { recursive: true });
  await replaceSourceMirror(options.targetRoot, sourceFiles);
  await writeFileAtomically(
    join(options.targetRoot, README_NAME),
    buildReadme(manifest),
  );
  await writeFileAtomically(
    join(options.targetRoot, MANIFEST_NAME),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  await writeFileAtomically(
    options.profilePath,
    replaceManagedProfileBlock(currentProfile, managedBlock),
  );

  const verifiedMirror: boolean = await mirrorIsComplete(
    options.targetRoot,
    sourceFiles,
  );
  if (!verifiedMirror) {
    throw new Error('Memory mirror verification failed after synchronization');
  }

  return {
    explicitPreferenceCount: manifest.explicitPreferenceCount,
    rolloutSummaryCount: manifest.rolloutSummaryCount,
    sourceDigest,
    sourceFileCount: manifest.sourceFileCount,
    status: 'updated',
    totalBytes: manifest.totalBytes,
  };
}

export { syncMemoryProfile, type MemorySyncOptions, type MemorySyncResult };
