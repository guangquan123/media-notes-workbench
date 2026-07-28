import { Injectable, Logger } from '@nestjs/common';
import { KeyFrame } from './frame-extraction.service';

export interface TranscriptSegment {
  start: number; // 秒
  end: number;   // 秒
  text: string;
}

@Injectable()
export class FrameInsertionService {
  private readonly logger = new Logger(FrameInsertionService.name);

  /**
   * 将带时间戳和 image_key 的截图插入笔记 Markdown
   */
  insertFramesIntoMarkdown(
    markdown: string,
    frames: KeyFrame[],
    totalDurationSec?: number,
  ): string {
    // 只处理有 image_key 的帧
    const validFrames = frames.filter((f) => f.imageKey);
    if (validFrames.length === 0) {
      this.logger.log('没有可插入的截图（无有效 image_key），跳过');
      return markdown;
    }

    this.logger.log(`开始将 ${validFrames.length} 张截图插入笔记`);

    // 解析 Markdown 章节结构
    const sections = this.parseSections(markdown);
    if (sections.length === 0) {
      // 无章节结构：直接在头部插入所有截图
      return this.insertAtTop(markdown, validFrames);
    }

    // 将帧分配到各章节
    const framesBySectionIdx = this.assignFramesToSections(
      validFrames,
      sections,
      totalDurationSec,
    );

    // 按章节从后往前插入（从后往前避免行号偏移问题）
    const lines = markdown.split('\n');
    const sectionIndices = Object.keys(framesBySectionIdx)
      .map(Number)
      .sort((a, b) => b - a); // 从后往前

    for (const sectionIdx of sectionIndices) {
      const sectionFrames = framesBySectionIdx[sectionIdx];
      if (!sectionFrames?.length) continue;

      const section = sections[sectionIdx];
      const insertLine = section.contentStartLine;

      // 生成截图 Markdown 块
      const imageBlocks = sectionFrames.map((frame) =>
        this.buildImageBlock(frame),
      );

      // 在章节标题后插入截图块
      lines.splice(insertLine, 0, ...imageBlocks.join('\n').split('\n'), '');
    }

    const result = lines.join('\n');
    this.logger.log('截图插入完成');
    return result;
  }

  /**
   * 解析 Markdown 中的 ## 级别章节
   */
  private parseSections(
    markdown: string,
  ): Array<{ title: string; lineIdx: number; contentStartLine: number }> {
    const lines = markdown.split('\n');
    const sections: Array<{
      title: string;
      lineIdx: number;
      contentStartLine: number;
    }> = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // 匹配 ## 级别标题（不包括 # 一级和 ### 三级以下）
      if (/^## /u.test(line) && !/^### /u.test(line)) {
        sections.push({
          title: line.replace(/^##\s+/u, '').trim(),
          lineIdx: i,
          contentStartLine: i + 1, // 标题下一行
        });
      }
    }
    return sections;
  }

  /**
   * 将帧按时间戳分配到对应章节（按比例均分）
   */
  private assignFramesToSections(
    frames: KeyFrame[],
    sections: Array<{ title: string; lineIdx: number; contentStartLine: number }>,
    totalDurationSec?: number,
  ): Record<number, KeyFrame[]> {
    const result: Record<number, KeyFrame[]> = {};

    // 如果只有一个章节，全部分配给它
    if (sections.length === 1) {
      result[0] = frames;
      return result;
    }

    // 按章节数量均分时间轴
    const estimatedDuration =
      totalDurationSec ?? (frames[frames.length - 1]?.timestamp ?? 600) * 1.2;
    const sectionDuration = estimatedDuration / sections.length;

    for (const frame of frames) {
      // 计算帧属于哪个章节
      const sectionIdx = Math.min(
        Math.floor(frame.timestamp / sectionDuration),
        sections.length - 1,
      );
      if (!result[sectionIdx]) result[sectionIdx] = [];
      result[sectionIdx].push(frame);
    }

    return result;
  }

  /**
   * 没有章节结构时，在笔记头部插入截图
   */
  private insertAtTop(markdown: string, frames: KeyFrame[]): string {
    const imageBlocks = frames.map((f) => this.buildImageBlock(f)).join('\n\n');
    // 找到第一个非标题行
    const firstH1End = markdown.indexOf('\n');
    if (firstH1End < 0) return markdown + '\n\n' + imageBlocks;
    return (
      markdown.slice(0, firstH1End + 1) +
      '\n' +
      imageBlocks +
      '\n\n' +
      markdown.slice(firstH1End + 1)
    );
  }

  /**
   * 构建单帧的 Markdown 图片块（含 AI 描述）
   */
  private buildImageBlock(frame: KeyFrame): string {
    const timeStr = this.formatTimestamp(frame.timestamp);
    const analysis = frame.analysis;

    // 图片 key：优先使用信息图，其次用原截图
    const displayKey =
      analysis?.isInfoGraphic && analysis.infoGraphicKey
        ? analysis.infoGraphicKey
        : frame.imageKey!;

    // 飞书文档支持 img_xxx 格式的 image_key 直接嵌入
    // 使用飞书 IM 图片 URL 格式，lark-cli docs +create 会自动处理
    const imageUrl = /^https?:\/\//u.test(displayKey)
      ? displayKey
      : `https://open.feishu.cn/open-apis/im/v1/images/${displayKey}`;

    let block = `![视频截图 ${timeStr}](${imageUrl})`;

    // 添加 AI 描述
    if (analysis) {
      if (analysis.isInfoGraphic) {
        block += `\n\n> 🎨 **AI 优化版本**（原画面经 AI 重新整理排版）`;
        if (analysis.text || analysis.chartDesc) {
          const desc = analysis.hasText ? analysis.text : analysis.chartDesc;
          block += `\n> ${desc.slice(0, 200).replace(/\n/g, ' ')}`;
        }
      } else if (analysis.summary || analysis.text || analysis.hasChart) {
        const desc = analysis.hasText && analysis.text
          ? `**文字内容**：${analysis.text.slice(0, 150)}`
          : analysis.hasChart
          ? `**图表内容**：${analysis.chartDesc.slice(0, 150)}`
          : analysis.summary;
        if (desc) {
          block += `\n\n> 🤖 **AI 识别**：${desc.replace(/\n/g, ' ')}`;
        }
      }
    }

    return block;
  }

  /**
   * 将秒数格式化为 HH:MM:SS
   */
  private formatTimestamp(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    if (h > 0) {
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
}
