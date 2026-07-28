import { resolve } from 'node:path';
import {
  syncMemoryProfile,
  type MemorySyncOptions,
  type MemorySyncResult,
} from '../server/common/utils/memory-profile-sync';

const DEFAULT_SOURCE_ROOT: string = '/Users/yangjie/.codex/memories';
const DEFAULT_TARGET_ROOT: string =
  '/Users/yangjie/Library/Mobile Documents/com~apple~CloudDocs/yj/' +
  '07_mydoc/01_typora/20_AI自动化知识库/99_自己用户画像/' +
  '01_Codex长期记忆镜像';
const DEFAULT_PROFILE_PATH: string =
  '/Users/yangjie/Library/Mobile Documents/com~apple~CloudDocs/yj/' +
  '07_mydoc/01_typora/20_AI自动化知识库/99_自己用户画像/' +
  '杨杰个人用户画像-v1.0-2026-07-28.md';

interface ParsedOptions {
  profilePath: string;
  sourceRoot: string;
  targetRoot: string;
}

function readOptionValue(
  argumentsList: string[],
  optionName: string,
): string | undefined {
  const optionIndex: number = argumentsList.indexOf(optionName);
  if (optionIndex === -1) {
    return undefined;
  }
  const optionValue: string | undefined = argumentsList[optionIndex + 1];
  if (!optionValue || optionValue.startsWith('--')) {
    throw new Error(`${optionName} requires a path value`);
  }
  return optionValue;
}

function parseOptions(argumentsList: string[]): ParsedOptions {
  const supportedOptions: Set<string> = new Set([
    '--profile',
    '--source',
    '--target',
  ]);
  for (let index: number = 0; index < argumentsList.length; index += 2) {
    const optionName: string = argumentsList[index];
    if (!supportedOptions.has(optionName)) {
      throw new Error(`Unsupported option: ${optionName}`);
    }
  }

  return {
    profilePath: resolve(
      readOptionValue(argumentsList, '--profile') ?? DEFAULT_PROFILE_PATH,
    ),
    sourceRoot: resolve(
      readOptionValue(argumentsList, '--source') ?? DEFAULT_SOURCE_ROOT,
    ),
    targetRoot: resolve(
      readOptionValue(argumentsList, '--target') ?? DEFAULT_TARGET_ROOT,
    ),
  };
}

async function main(): Promise<void> {
  const parsedOptions: ParsedOptions = parseOptions(process.argv.slice(2));
  const syncOptions: MemorySyncOptions = {
    profilePath: parsedOptions.profilePath,
    sourceRoot: parsedOptions.sourceRoot,
    targetRoot: parsedOptions.targetRoot,
  };
  const result: MemorySyncResult = await syncMemoryProfile(syncOptions);
  process.stdout.write(
    `${JSON.stringify(
      {
        ...result,
        profilePath: parsedOptions.profilePath,
        sourceRoot: parsedOptions.sourceRoot,
        targetRoot: parsedOptions.targetRoot,
      },
      null,
      2,
    )}\n`,
  );
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.stack || error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
