import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { getLocalDataDir } from '../../common/utils/local-runtime-paths';

export interface WhisperPackManifest {
  binarySha256: string;
  binaryUrl: string;
  modelSha256: string;
  modelUrl: string;
  modelFileName: string;
  version: string;
}

export interface WhisperPackPaths {
  cliPath: string;
  modelPath: string;
  toolsDir: string;
  modelsDir: string;
}

export const WHISPER_PACK_MANIFEST: WhisperPackManifest = {
  binarySha256: 'f9ec6c52a2e949b62ab51fa21d0d497958f9e41c3010c157c4e42932d5316f3c',
  binaryUrl:
    'https://github.com/ggml-org/whisper.cpp/releases/download/b5130/whisper-bin-x64.zip',
  modelSha256:
    '1472da3b8dde27b952b515a60bbea06532be2639bcecc5a6c9dd248bed11865d',
  modelUrl:
    'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base-q5_1.bin',
  modelFileName: 'ggml-base-q5_1.bin',
  version: 'b5130',
};

export function getWhisperPackPaths(): WhisperPackPaths {
  const dataDir: string = getLocalDataDir();
  const toolsDir: string = join(dataDir, 'tools');
  const modelsDir: string = join(dataDir, 'models');
  const cliFileName: string =
    process.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli';
  return {
    cliPath: join(toolsDir, cliFileName),
    modelPath: join(modelsDir, WHISPER_PACK_MANIFEST.modelFileName),
    toolsDir,
    modelsDir,
  };
}

export function isWhisperPackSupported(): boolean {
  return process.platform === 'win32' && process.arch === 'x64';
}

export function sha256Matches(actual: string, expected: string): boolean {
  return actual.trim().toLowerCase() === expected.trim().toLowerCase();
}

export function isWhisperCliPath(path: string): boolean {
  return existsSync(path);
}
