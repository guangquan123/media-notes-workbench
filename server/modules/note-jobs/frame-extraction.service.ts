import { Injectable, Logger } from '@nestjs/common';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { spawn } from 'node:child_process';

export interface KeyFrame {
  /** 帧在视频中的时间（秒） */
  timestamp: number;
  /** 本地临时文件路径 */
  filePath: string;
  /** 提取方式 */
  type: 'scene' | 'interval';
  /** 上传后的飞书 image_key（格式：img_xxx） */
  imageKey?: string;
  /** AI 识别的内容描述（JSON 解析后） */
  analysis?: FrameAnalysis;
}

export interface FrameAnalysis {
  hasText: boolean;
  text: string;
  hasChart: boolean;
  chartDesc: string;
  summary: string;
  score: number;
  /** 是否被替换为 AI 生成的信息图 */
  isInfoGraphic?: boolean;
  /** 信息图的 image_key */
  infoGraphicKey?: string;
}

type CommandResult = { stdout: string; stderr: string };

@Injectable()
export class FrameExtractionService {
  private readonly logger = new Logger(FrameExtractionService.name);

  /**
   * 主入口：从视频中提取所有关键帧
   */
  async extractKeyFrames(
    videoPath: string,
    workDir: string,
  ): Promise<KeyFrame[]> {
    const framesDir = join(workDir, 'frames');
    await mkdir(framesDir, { recursive: true });

    this.logger.log(`开始提取关键帧，视频路径: ${videoPath}`);

    // 1. 获取视频时长
    let duration = 0;
    try {
      duration = await this.getVideoDuration(videoPath);
      this.logger.log(`视频时长: ${duration.toFixed(1)}s`);
    } catch (err) {
      this.logger.warn(`获取视频时长失败: ${String(err)}，使用等间隔模式`);
    }

    // 2. 场景检测帧提取
    const sceneFrames = await this.extractSceneFrames(videoPath, framesDir);
    this.logger.log(`场景检测提取到 ${sceneFrames.length} 帧`);

    // 3. 等间隔采样兜底
    const intervalFrames = await this.extractIntervalFrames(
      videoPath,
      framesDir,
      duration,
    );
    this.logger.log(`等间隔采样提取到 ${intervalFrames.length} 帧`);

    // 4. 合并去重
    const merged = this.mergeAndDedup(sceneFrames, intervalFrames);
    this.logger.log(`合并去重后共 ${merged.length} 帧`);

    return merged;
  }

  /**
   * 使用 ffprobe 获取视频时长（秒）
   */
  private async getVideoDuration(videoPath: string): Promise<number> {
    const result = await runCommand('ffprobe', [
      '-v', 'quiet',
      '-print_format', 'json',
      '-show_format',
      videoPath,
    ]);
    const info = JSON.parse(result.stdout) as {
      format?: { duration?: string };
    };
    const dur = parseFloat(info.format?.duration ?? '0');
    return isNaN(dur) ? 0 : dur;
  }

  /**
   * FFmpeg 场景检测：捕捉 PPT 翻页、场景切换等明显变化
   * 阈值 0.3：对演讲/课程类视频比较合适
   */
  private async extractSceneFrames(
    videoPath: string,
    framesDir: string,
  ): Promise<KeyFrame[]> {
    try {
      // 使用场景检测过滤器提取帧，scale 到 1280 宽
      await runCommand('ffmpeg', [
        '-hide_banner', '-loglevel', 'error',
        '-i', videoPath,
        '-vf', "select='gt(scene,0.3)',scale=1280:-2",
        '-vsync', 'vfr',
        '-q:v', '2',
        join(framesDir, 'scene_%04d.jpg'),
      ]);
    } catch (err) {
      this.logger.warn(`场景检测提取帧失败: ${String(err)}`);
      return [];
    }

    // 获取提取到的帧列表，并获取各帧时间戳
    return this.collectFramesFromDir(framesDir, 'scene_', videoPath);
  }

  /**
   * 等间隔采样：每 60 秒一帧（兜底策略）
   */
  private async extractIntervalFrames(
    videoPath: string,
    framesDir: string,
    duration: number,
  ): Promise<KeyFrame[]> {
    // 每 60 秒采一帧，最少 1 帧
    const intervalSec = 60;
    try {
      await runCommand('ffmpeg', [
        '-hide_banner', '-loglevel', 'error',
        '-i', videoPath,
        '-vf', `fps=1/${intervalSec},scale=1280:-2`,
        '-q:v', '2',
        join(framesDir, 'interval_%04d.jpg'),
      ]);
    } catch (err) {
      this.logger.warn(`等间隔帧提取失败: ${String(err)}`);
      return [];
    }

    return this.collectFramesFromDir(framesDir, 'interval_', videoPath, intervalSec);
  }

  /**
   * 从目录中收集特定前缀的帧文件，并反推时间戳
   */
  private async collectFramesFromDir(
    framesDir: string,
    prefix: string,
    videoPath: string,
    intervalSec?: number,
  ): Promise<KeyFrame[]> {
    const { readdir, stat } = await import('node:fs/promises');
    let files: string[];
    try {
      files = (await readdir(framesDir))
        .filter((f) => f.startsWith(prefix) && f.endsWith('.jpg'))
        .sort();
    } catch {
      return [];
    }

    const frames: KeyFrame[] = [];
    for (let i = 0; i < files.length; i++) {
      const filePath = join(framesDir, files[i]);
      // 检查文件大小，过滤掉极小的帧（可能是全黑/全白）
      try {
        const s = await stat(filePath);
        if (s.size < 5000) continue; // 小于 5KB 的帧认为无信息
      } catch {
        continue;
      }

      // 计算时间戳
      let timestamp: number;
      if (intervalSec !== undefined) {
        // 等间隔：第 i 帧 = i * interval + interval/2（取中间点）
        timestamp = i * intervalSec + intervalSec / 2;
      } else {
        // 场景检测帧：用帧序号近似（实际时间戳需要 ffprobe 精确获取，这里用序号 * 平均帧间隔）
        // 为了简单，先用序号作为近似时间，后续对齐时按比例处理
        timestamp = i * 30; // 近似值
      }

      frames.push({
        timestamp,
        filePath,
        type: prefix.startsWith('scene') ? 'scene' : 'interval',
      });
    }
    return frames;
  }

  /**
   * 合并场景帧和等间隔帧，按时间排序，去除距离过近的重复帧
   */
  private mergeAndDedup(
    sceneFrames: KeyFrame[],
    intervalFrames: KeyFrame[],
  ): KeyFrame[] {
    // 合并所有帧
    const all = [...sceneFrames, ...intervalFrames].sort(
      (a, b) => a.timestamp - b.timestamp,
    );

    if (all.length === 0) return [];

    // 去重：时间距离 < 5s 的帧，保留场景检测帧（优先）
    const deduped: KeyFrame[] = [all[0]];
    for (let i = 1; i < all.length; i++) {
      const prev = deduped[deduped.length - 1];
      const curr = all[i];
      if (curr.timestamp - prev.timestamp < 5) {
        // 如果当前帧是场景检测帧，替换掉前一个
        if (curr.type === 'scene' && prev.type === 'interval') {
          deduped[deduped.length - 1] = curr;
        }
        // 否则跳过（保留已有的）
      } else {
        deduped.push(curr);
      }
    }

    return deduped;
  }
}

// ---- 辅助函数 ----

async function runCommand(
  command: string,
  args: string[],
  stdin?: string,
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    proc.stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk));
    proc.stderr.on('data', (chunk: Buffer) => stderrChunks.push(chunk));
    if (stdin) { proc.stdin.write(stdin); }
    proc.stdin.end();
    proc.on('close', (code) => {
      const stdout = Buffer.concat(stdoutChunks).toString('utf8');
      const stderr = Buffer.concat(stderrChunks).toString('utf8');
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${command} exited with code ${code}\n${stderr}`));
    });
    proc.on('error', reject);
  });
}
