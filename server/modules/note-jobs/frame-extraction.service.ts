import { Injectable, Logger } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, readdir, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';

export interface FrameAnalysis {
  chartDesc: string;
  hasChart: boolean;
  hasText: boolean;
  isPresentationSlide?: boolean;
  score: number;
  slideTitle?: string;
  summary: string;
  text: string;
}

export interface KeyFrame {
  analysis?: FrameAnalysis;
  derivativeUrl?: string;
  filePath: string;
  globalTimestamp?: number;
  id: string;
  imageKey?: string;
  perceptualHash?: string;
  previewDataUrl?: string;
  sceneScore?: number;
  selectionScore?: number;
  sourceFileName: string;
  sourceIndex: number;
  timestamp: number;
  type: 'scene' | 'interval';
  uniquenessScore?: number;
  visualInformationScore?: number;
}

type CommandResult = { stderr: string; stdout: string };

interface ParsedShowInfo {
  sceneScore: number;
  timestamp: number;
}

export type FrameExtractionProfile = 'presentation' | 'standard';

export function getFrameExtractionConfig(profile: FrameExtractionProfile): {
  duplicateDistance: number;
  intervalSec: number;
  sceneThreshold: number;
} {
  return profile === 'presentation'
    ? { duplicateDistance: 2, intervalSec: 15, sceneThreshold: 0.12 }
    : { duplicateDistance: 5, intervalSec: 60, sceneThreshold: 0.28 };
}

export function parseShowInfo(stderr: string): ParsedShowInfo[] {
  const lines = stderr.split('\n');
  const result: ParsedShowInfo[] = [];
  let pendingSceneScore = 0;
  for (const line of lines) {
    const sceneMatch = /lavfi\.scene_score[=:]\s*([0-9.]+)/u.exec(line);
    if (sceneMatch) pendingSceneScore = Number(sceneMatch[1]) || 0;
    const timestampMatch = /Parsed_showinfo_[^\]]*\].*pts_time:([0-9.]+)/u.exec(
      line,
    );
    if (!timestampMatch) continue;
    result.push({
      sceneScore: pendingSceneScore,
      timestamp: Number(timestampMatch[1]),
    });
    pendingSceneScore = 0;
  }
  return result;
}

export function computePerceptualHash(pixels: Uint8Array): string {
  if (pixels.length !== 72) throw new Error('感知哈希需要 9x8 灰度像素');
  let bits = '';
  for (let row = 0; row < 8; row += 1) {
    for (let column = 0; column < 8; column += 1) {
      const left = pixels[row * 9 + column];
      const right = pixels[row * 9 + column + 1];
      bits += left > right ? '1' : '0';
    }
  }
  return BigInt(`0b${bits}`).toString(16).padStart(16, '0');
}

export function hammingDistance(left: string, right: string): number {
  const xor = BigInt(`0x${left}`) ^ BigInt(`0x${right}`);
  let value = xor;
  let distance = 0;
  while (value > 0n) {
    distance += Number(value & 1n);
    value >>= 1n;
  }
  return distance;
}

export function calculateVisualInformationScore(pixels: Uint8Array): number {
  if (pixels.length === 0) return 0;
  const mean = pixels.reduce((sum, value) => sum + value, 0) / pixels.length;
  const variance =
    pixels.reduce((sum, value) => sum + (value - mean) ** 2, 0) / pixels.length;
  const contrast = Math.min(1, Math.sqrt(variance) / 64);
  const exposure = 1 - Math.min(1, Math.abs(mean - 128) / 128);
  return Number((contrast * 0.75 + exposure * 0.25).toFixed(4));
}

@Injectable()
export class FrameExtractionService {
  private readonly logger = new Logger(FrameExtractionService.name);

  async extractKeyFrames(
    videoPath: string,
    workDir: string,
    sourceIndex = 0,
    globalOffsetSec = 0,
    profile: FrameExtractionProfile = 'standard',
  ): Promise<KeyFrame[]> {
    const config = getFrameExtractionConfig(profile);
    const framesDir = join(workDir, `frames-${profile}-${sourceIndex}`);
    await mkdir(framesDir, { recursive: true });
    const outputPattern = join(framesDir, 'candidate_%06d.png');
    const filter = [
      `select='isnan(prev_selected_t)+gt(scene,${config.sceneThreshold})+gte(t-prev_selected_t,${config.intervalSec})'`,
      'metadata=print',
      'scale=1280:-2',
      'showinfo',
    ].join(',');
    this.logger.log(`单遍扫描关键帧: ${videoPath}`);
    let commandResult: CommandResult;
    try {
      commandResult = await runCommand('ffmpeg', [
        '-hide_banner',
        '-loglevel',
        'info',
        '-i',
        videoPath,
        '-vf',
        filter,
        '-fps_mode',
        'vfr',
        '-compression_level',
        '4',
        '-y',
        outputPattern,
      ]);
    } catch (error) {
      this.logger.warn(`关键帧单遍扫描失败: ${String(error)}`);
      return [];
    }
    const timestamps = parseShowInfo(commandResult.stderr);
    const files = (await readdir(framesDir))
      .filter((fileName) => /^candidate_\d+\.png$/u.test(fileName))
      .sort();
    const candidates: KeyFrame[] = [];
    for (let index = 0; index < files.length; index += 1) {
      const filePath = join(framesDir, files[index]);
      if ((await stat(filePath)).size < 2_000) continue;
      const pixels = await this.readGrayscalePixels(filePath);
      const visualInformationScore = calculateVisualInformationScore(pixels);
      if (visualInformationScore < 0.12) continue;
      const perceptualHash = computePerceptualHash(pixels);
      const nearestDistance =
        candidates.length === 0
          ? 64
          : Math.min(
              ...candidates.map((candidate) =>
                hammingDistance(candidate.perceptualHash!, perceptualHash),
              ),
            );
      if (nearestDistance <= config.duplicateDistance) continue;
      const info = timestamps[index] ?? {
        sceneScore: 0,
        timestamp: index * config.intervalSec,
      };
      candidates.push({
        filePath,
        globalTimestamp: info.timestamp + globalOffsetSec,
        id:
          createHash('sha256')
            .update(`${sourceIndex}:${info.timestamp}:${perceptualHash}`)
            .digest('hex')
            .slice(0, 32) || randomUUID(),
        perceptualHash,
        sceneScore: info.sceneScore,
        sourceFileName: basename(videoPath),
        sourceIndex,
        timestamp: info.timestamp,
        type: info.sceneScore >= config.sceneThreshold ? 'scene' : 'interval',
        uniquenessScore: Number((nearestDistance / 64).toFixed(4)),
        visualInformationScore,
      });
    }
    this.logger.log(
      `本地质量过滤后保留 ${candidates.length}/${files.length} 帧`,
    );
    return candidates;
  }

  async getVideoDuration(videoPath: string): Promise<number> {
    const result = await runCommand('ffprobe', [
      '-v',
      'error',
      '-show_entries',
      'format=duration',
      '-of',
      'default=noprint_wrappers=1:nokey=1',
      videoPath,
    ]);
    const duration = Number(result.stdout.trim());
    return Number.isFinite(duration) && duration > 0 ? duration : 0;
  }

  private async readGrayscalePixels(filePath: string): Promise<Uint8Array> {
    const result = await runCommandBuffer('ffmpeg', [
      '-hide_banner',
      '-loglevel',
      'error',
      '-i',
      filePath,
      '-vf',
      'scale=9:8,format=gray',
      '-f',
      'rawvideo',
      '-',
    ]);
    if (result.length !== 72) {
      throw new Error(`无法读取截图灰度像素: ${filePath}`);
    }
    return new Uint8Array(result);
  }
}

async function runCommand(
  command: string,
  args: string[],
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const childProcess = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: process.platform === 'win32',
    });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    childProcess.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
    childProcess.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk));
    childProcess.on('close', (code) => {
      const stdout = Buffer.concat(stdoutChunks).toString('utf8');
      const stderr = Buffer.concat(stderrChunks).toString('utf8');
      if (code === 0) resolve({ stderr, stdout });
      else reject(new Error(`${command} exited with code ${code}\n${stderr}`));
    });
    childProcess.on('error', reject);
  });
}

async function runCommandBuffer(
  command: string,
  args: string[],
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const childProcess = spawn(command, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: process.platform === 'win32',
    });
    const chunks: Buffer[] = [];
    const errors: Buffer[] = [];
    childProcess.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
    childProcess.stderr.on('data', (chunk: Buffer) => errors.push(chunk));
    childProcess.on('close', (code) => {
      if (code === 0) resolve(Buffer.concat(chunks));
      else reject(new Error(Buffer.concat(errors).toString('utf8')));
    });
    childProcess.on('error', reject);
  });
}
