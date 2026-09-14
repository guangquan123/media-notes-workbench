import { randomUUID } from 'node:crypto';
import { mkdir, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { Logger } from '@nestjs/common';

const logger = new Logger('LocalFileWrite');

export class LocalFilePersistenceError extends Error {
  readonly code = 'LOCAL_FILE_PERSISTENCE_FAILED';

  constructor(cause: unknown) {
    super(
      '无法保存本机配置。请确认磁盘有可用空间，并检查“%LOCALAPPDATA%\\MediaNotesWorkbench”文件夹的读写权限后重试。',
      { cause },
    );
    this.name = LocalFilePersistenceError.name;
  }
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    const code: string =
      'code' in error && typeof error.code === 'string'
        ? ` [${error.code}]`
        : '';
    return `${error.message}${code}`;
  }
  return String(error);
}

async function removeTemporaryFile(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch (error) {
    const code: string | undefined =
      error && typeof error === 'object' && 'code' in error
        ? String((error as { code?: unknown }).code)
        : undefined;
    if (code !== 'ENOENT') {
      logger.warn(
        `本机配置已保存，但未能清理临时文件：${describeError(error)}`,
      );
    }
  }
}

/**
 * Persist local JSON or text configuration. Windows endpoint protection can
 * reject an otherwise valid same-directory rename with EBADF/EPERM. Keep the
 * atomic path first, then safely fall back to a direct replacement so setup
 * does not fail after the temporary file was already written.
 */
export async function writeLocalTextFile(
  targetPath: string,
  content: string,
): Promise<void> {
  const temporaryPath: string = `${targetPath}.${process.pid}.${randomUUID()}.tmp`;
  try {
    await mkdir(dirname(targetPath), { recursive: true });
  } catch (error) {
    logger.error(
      `无法创建本机配置目录：${describeError(error)}`,
      error instanceof Error ? error.stack : undefined,
    );
    throw new LocalFilePersistenceError(error);
  }

  try {
    await writeFile(temporaryPath, content, { encoding: 'utf8', mode: 0o600 });
    await rename(temporaryPath, targetPath);
    return;
  } catch (atomicError) {
    logger.warn(
      `本机配置原子替换失败，将改用兼容写入：${describeError(atomicError)}`,
    );
  }

  try {
    await writeFile(targetPath, content, { encoding: 'utf8', mode: 0o600 });
  } catch (fallbackError) {
    logger.error(
      `本机配置兼容写入失败：${describeError(fallbackError)}`,
      fallbackError instanceof Error ? fallbackError.stack : undefined,
    );
    throw new LocalFilePersistenceError(fallbackError);
  } finally {
    await removeTemporaryFile(temporaryPath);
  }
}
