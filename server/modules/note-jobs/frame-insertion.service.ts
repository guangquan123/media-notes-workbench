import { Injectable, Logger } from '@nestjs/common';
import { KeyFrame } from './frame-extraction.service';
import type { DocumentDraft, DocumentMediaAsset } from './document-media.utils';

export interface TranscriptSegment {
  start: number; // 秒
  end: number; // 秒
  text: string;
}

interface MarkdownSection {
  content: string;
  contentStartLine: number;
  lineIdx: number;
  title: string;
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
    return this.buildDocumentDraft(markdown, frames, {
      presentationMode: false,
      totalDurationSec,
    }).markdown;
  }

  buildDocumentDraft(
    markdown: string,
    frames: KeyFrame[],
    options: {
      presentationMode: boolean;
      totalDurationSec?: number;
    },
  ): DocumentDraft {
    const invalidFrames = frames.filter(
      (frame: KeyFrame): boolean => !frame.filePath && !frame.previewDataUrl,
    );
    if (invalidFrames.length > 0) {
      throw new Error(
        `有 ${invalidFrames.length} 张关键画面缺少本地媒体，无法发布`,
      );
    }
    const validFrames = frames.filter((frame: KeyFrame): boolean =>
      Boolean(frame.filePath || frame.previewDataUrl),
    );
    if (validFrames.length === 0) {
      this.logger.log('没有可插入的截图（无有效本地媒体），跳过');
      return { markdown, media: [] };
    }

    this.logger.log(`开始将 ${validFrames.length} 张截图插入笔记`);
    if (options.presentationMode) {
      return this.buildPresentationDraft(markdown, validFrames);
    }

    // 解析 Markdown 章节结构
    const sections = this.parseSections(markdown);
    if (sections.length === 0) {
      return this.insertAtTop(markdown, validFrames);
    }

    // 将帧分配到各章节
    const framesBySectionIdx = this.assignFramesToSections(
      validFrames,
      sections,
      options.totalDurationSec,
    );
    const blocksById = new Map<string, DocumentDraft>(
      validFrames.map((frame: KeyFrame, index: number) => [
        frame.id,
        this.buildImageBlock(frame, index, false),
      ]),
    );

    // 按章节从后往前插入（从后往前避免行号偏移问题）
    const lines = markdown.split('\n');
    const sectionIndices = Object.keys(framesBySectionIdx)
      .map(Number)
      .sort((a, b) => b - a); // 从后往前

    for (const sectionIdx of sectionIndices) {
      const sectionFrames = framesBySectionIdx[sectionIdx];
      if (!sectionFrames?.length) continue;

      const section: MarkdownSection | undefined =
        sections[sectionIdx] || sections[0];
      if (!section) {
        this.logger.warn(
          `关键帧章节索引无效，跳过 ${sectionFrames.length} 张截图`,
        );
        continue;
      }
      const insertLine = section.contentStartLine;

      // 生成截图 Markdown 块
      const imageBlocks = sectionFrames.map(
        (frame: KeyFrame): string => blocksById.get(frame.id)?.markdown || '',
      );

      // 在章节标题后插入截图块
      lines.splice(insertLine, 0, ...imageBlocks.join('\n').split('\n'), '');
    }

    const result = lines.join('\n');
    this.logger.log('截图插入完成');
    return {
      markdown: result,
      media: validFrames.flatMap(
        (frame: KeyFrame): DocumentMediaAsset[] =>
          blocksById.get(frame.id)?.media || [],
      ),
    };
  }

  /**
   * 解析 Markdown 中的 ## 级别章节
   */
  private parseSections(markdown: string): MarkdownSection[] {
    const lines = markdown.split('\n');
    const sections: MarkdownSection[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // 匹配 ## 级别标题（不包括 # 一级和 ### 三级以下）
      if (/^## /u.test(line) && !/^### /u.test(line)) {
        sections.push({
          content: '',
          title: line.replace(/^##\s+/u, '').trim(),
          lineIdx: i,
          contentStartLine: i + 1, // 标题下一行
        });
      }
    }
    for (let index = 0; index < sections.length; index += 1) {
      const section: MarkdownSection = sections[index];
      const nextSection: MarkdownSection | undefined = sections[index + 1];
      section.content = lines
        .slice(section.contentStartLine, nextSection?.lineIdx ?? lines.length)
        .join('\n');
    }
    return sections;
  }

  /**
   * 将帧按时间戳分配到对应章节（按比例均分）
   */
  private assignFramesToSections(
    frames: KeyFrame[],
    sections: MarkdownSection[],
    totalDurationSec?: number,
  ): Record<number, KeyFrame[]> {
    const result: Record<number, KeyFrame[]> = {};

    // 如果只有一个章节，全部分配给它
    if (sections.length === 1) {
      result[0] = frames;
      return result;
    }

    // 按章节数量均分时间轴
    const lastFrameTimestamp: number = frames.reduce(
      (maximum: number, frame: KeyFrame): number =>
        Math.max(maximum, this.getFrameTimestamp(frame)),
      0,
    );
    const requestedDuration: number =
      totalDurationSec ?? lastFrameTimestamp * 1.2;
    const estimatedDuration: number =
      Number.isFinite(requestedDuration) && requestedDuration > 0
        ? requestedDuration
        : Math.max(1, lastFrameTimestamp * 1.2);
    const sectionDuration = estimatedDuration / sections.length;

    for (const frame of frames) {
      const semanticSectionIdx: number | undefined = this.findSemanticSection(
        frame,
        sections,
      );
      const calculatedSectionIdx: number = Math.floor(
        this.getFrameTimestamp(frame) / sectionDuration,
      );
      const sectionIdx: number =
        semanticSectionIdx ??
        (Number.isInteger(calculatedSectionIdx) && calculatedSectionIdx >= 0
          ? Math.min(calculatedSectionIdx, sections.length - 1)
          : 0);
      if (!result[sectionIdx]) result[sectionIdx] = [];
      result[sectionIdx].push(frame);
    }

    return result;
  }

  private getFrameTimestamp(frame: KeyFrame): number {
    const timestamp: number = frame.globalTimestamp ?? frame.timestamp;
    return Number.isFinite(timestamp) && timestamp >= 0 ? timestamp : 0;
  }

  private findSemanticSection(
    frame: KeyFrame,
    sections: MarkdownSection[],
  ): number | undefined {
    const analysisText: string = [
      frame.analysis?.summary,
      frame.analysis?.text,
      frame.analysis?.chartDesc,
    ]
      .filter(Boolean)
      .join(' ');
    const frameTokens: Set<string> = this.extractSemanticTokens(analysisText);
    if (frameTokens.size === 0) return undefined;

    let bestIndex: number | undefined;
    let bestScore = 0;
    for (let index = 0; index < sections.length; index += 1) {
      const section: MarkdownSection = sections[index];
      const sectionTokens: Set<string> = this.extractSemanticTokens(
        `${section.title} ${section.content}`,
      );
      const score: number = [...frameTokens].filter((token: string): boolean =>
        sectionTokens.has(token),
      ).length;
      if (score > bestScore) {
        bestIndex = index;
        bestScore = score;
      }
    }
    return bestScore >= 2 ? bestIndex : undefined;
  }

  private extractSemanticTokens(text: string): Set<string> {
    const tokens: Set<string> = new Set<string>();
    for (const match of text
      .toLowerCase()
      .matchAll(/[\p{Script=Han}]+|[a-z0-9]+/gu)) {
      const value: string | undefined = match[0];
      if (!value) continue;
      if (/^[a-z0-9]+$/u.test(value)) {
        if (value.length >= 2) tokens.add(value);
        continue;
      }
      for (let index = 0; index < value.length - 1; index += 1) {
        tokens.add(value.slice(index, index + 2));
      }
    }
    return tokens;
  }

  /**
   * 没有章节结构时，在笔记头部插入截图
   */
  private insertAtTop(markdown: string, frames: KeyFrame[]): DocumentDraft {
    const blocks = frames.map((frame: KeyFrame, index: number) =>
      this.buildImageBlock(frame, index, false),
    );
    const imageBlocks = blocks
      .map((block: DocumentDraft): string => block.markdown)
      .join('\n\n');
    const media = blocks.flatMap(
      (block: DocumentDraft): DocumentMediaAsset[] => block.media,
    );
    const firstH1End = markdown.indexOf('\n');
    if (firstH1End < 0) {
      return { markdown: markdown + '\n\n' + imageBlocks, media };
    }
    return {
      markdown:
        markdown.slice(0, firstH1End + 1) +
        '\n' +
        imageBlocks +
        '\n\n' +
        markdown.slice(firstH1End + 1),
      media,
    };
  }

  /**
   * 构建单帧的 Markdown 图片块（含 AI 描述）
   */
  private buildImageBlock(
    frame: KeyFrame,
    index: number,
    presentationMode: boolean,
  ): DocumentDraft {
    const timeStr = this.formatTimestamp(
      frame.globalTimestamp ?? frame.timestamp,
    );
    const analysis = frame.analysis;
    const displayIndex = index + 1;
    const originalAnchor = presentationMode
      ? `第 ${displayIndex} 页原始画面（${timeStr}）`
      : `图 ${displayIndex}：视频原始截图（${timeStr}）`;
    let block = presentationMode
      ? `### 第 ${displayIndex} 页（${timeStr}）\n\n**${originalAnchor}**`
      : `**${originalAnchor}**`;
    const media: DocumentMediaAsset[] = [
      {
        anchor: originalAnchor,
        caption: presentationMode
          ? `培训课件第 ${displayIndex} 页 ${timeStr}`
          : `视频原始截图 ${timeStr}`,
        source: frame.filePath
          ? { kind: 'file', path: frame.filePath }
          : { kind: 'data-url', value: frame.previewDataUrl! },
      },
    ];

    // 添加 AI 描述
    if (analysis) {
      if (analysis.summary || analysis.text || analysis.hasChart) {
        const desc =
          analysis.hasText && analysis.text
            ? `**文字内容**：${
                presentationMode ? analysis.text : analysis.text.slice(0, 150)
              }`
            : analysis.hasChart
              ? `**图表内容**：${
                  presentationMode
                    ? analysis.chartDesc
                    : analysis.chartDesc.slice(0, 150)
                }`
              : analysis.summary;
        if (desc) {
          block += `\n\n> 🤖 **AI 识别**：${desc.replace(/\n/g, ' ')}`;
        }
      }
    }
    if (frame.derivativeUrl) {
      const derivativeAnchor = `图 ${displayIndex}-AI：派生信息图（${timeStr}）`;
      block += `\n\n**${derivativeAnchor}**`;
      block +=
        '\n\n> 🎨 **AI 派生版本**：用于提升可读性；原始截图保留在上方，内容以原图和文字稿为准。';
      media.push({
        anchor: derivativeAnchor,
        caption: `AI 派生信息图 ${timeStr}`,
        optional: true,
        source: { kind: 'remote-url', url: frame.derivativeUrl },
      });
    }

    return { markdown: block, media };
  }

  private buildPresentationDraft(
    markdown: string,
    frames: KeyFrame[],
  ): DocumentDraft {
    const blocks = frames.map((frame: KeyFrame, index: number) =>
      this.buildImageBlock(frame, index, true),
    );
    return {
      markdown: [
        markdown.trim(),
        '',
        '## 培训课件逐页记录',
        '',
        ...blocks.flatMap((block: DocumentDraft): string[] => [
          block.markdown,
          '',
        ]),
      ].join('\n'),
      media: blocks.flatMap(
        (block: DocumentDraft): DocumentMediaAsset[] => block.media,
      ),
    };
  }

  /**
   * 将秒数格式化为 HH:MM:SS
   */
  private formatTimestamp(seconds: number): string {
    const safeSeconds = Number.isFinite(seconds) && seconds >= 0 ? seconds : 0;
    const h = Math.floor(safeSeconds / 3600);
    const m = Math.floor((safeSeconds % 3600) / 60);
    const s = Math.floor(safeSeconds % 60);
    if (h > 0) {
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
}
