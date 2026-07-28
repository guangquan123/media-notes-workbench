import { Injectable, Logger, Inject } from '@nestjs/common';
import { CapabilityService } from '@lark-apaas/fullstack-nestjs-core';
import { KeyFrame, FrameAnalysis } from './frame-extraction.service';

@Injectable()
export class FrameAiEnhanceService {
  private readonly logger = new Logger(FrameAiEnhanceService.name);

  constructor(
    @Inject() private readonly capabilityService: CapabilityService,
  ) {}

  /**
   * 批量 AI 增强所有帧：识别内容 + 可选信息图生成
   * 并发数 = 2（避免 AI 限流）
   */
  async enhanceFrames(
    frames: KeyFrame[],
    options: { allowExternalAi: boolean; generateDerivatives: boolean },
  ): Promise<KeyFrame[]> {
    if (!options.allowExternalAi) {
      this.logger.log('用户未允许外部 AI，跳过截图 AI 识别');
      return frames;
    }
    const uploadedFrames = frames.filter((f) => f.imageKey);
    if (uploadedFrames.length === 0) {
      this.logger.warn('没有成功上传的帧，跳过 AI 增强');
      return frames;
    }

    this.logger.log(`开始 AI 识别 ${uploadedFrames.length} 张截图`);

    const CONCURRENCY = 2;
    const result: KeyFrame[] = [...frames];
    const uploadedIndices = frames
      .map((f, i) => (f.imageKey ? i : -1))
      .filter((i) => i >= 0);

    for (let batch = 0; batch < uploadedIndices.length; batch += CONCURRENCY) {
      const batchIndices = uploadedIndices.slice(batch, batch + CONCURRENCY);
      await Promise.all(
        batchIndices.map(async (frameIdx) => {
          const frame = frames[frameIdx];
          try {
            // Step 1: AI 识别图片内容
            const analysis = await this.analyzeFrame(frame);
            result[frameIdx] = { ...frame, analysis };

            this.logger.log(
              `帧 ${frameIdx + 1} AI 识别完成: score=${analysis.score}, hasText=${analysis.hasText}, hasChart=${analysis.hasChart}`,
            );

            // Step 2: 对高价值帧生成优化信息图
            if (
              options.generateDerivatives &&
              this.shouldGenerateInfoGraphic(analysis)
            ) {
              try {
                const derivativeUrl = await this.generateDerivative(frame, analysis);
                if (derivativeUrl) {
                  result[frameIdx].derivativeUrl = derivativeUrl;
                  this.logger.log(`帧 ${frameIdx + 1} 信息图生成成功: ${derivativeUrl}`);
                }
              } catch (err) {
                this.logger.warn(`帧 ${frameIdx + 1} 信息图生成失败，使用原图: ${String(err)}`);
              }
            }
          } catch (err) {
            this.logger.warn(`帧 ${frameIdx + 1} AI 识别失败，跳过: ${String(err)}`);
          }
        }),
      );
    }

    return result;
  }

  /**
   * AI 识别单帧图片内容（OCR + 图表识别）
   */
  async analyzeFrame(frame: KeyFrame): Promise<FrameAnalysis> {
    const defaultAnalysis: FrameAnalysis = {
      hasText: false,
      text: '',
      hasChart: false,
      chartDesc: '',
      summary: '',
      score: 2,
    };

    try {
      // 构建飞书图片 URL（从 image_key 转换）
      const imageUrl =
        frame.previewDataUrl || this.buildFeishuImageUrl(frame.imageKey!);

      const streamResult = await this.capabilityService
        .load('frame-image-understanding')
        .callStream('imageUnderstanding', {
          images: [imageUrl],
        });

      // 收集流式返回的文本
      let rawContent = '';
      if (streamResult && typeof streamResult === 'object' && Symbol.asyncIterator in Object(streamResult)) {
        for await (const chunk of streamResult as AsyncIterable<Record<string, unknown>>) {
          const delta =
            typeof chunk.content === 'string' ? chunk.content :
            typeof chunk.response === 'string' ? chunk.response : '';
          if (delta) {
            rawContent = delta.startsWith(rawContent) ? delta : rawContent + delta;
          }
        }
      } else if (streamResult && typeof (streamResult as unknown as Record<string, unknown>).output !== 'undefined') {
        const output = (streamResult as unknown as Record<string, unknown>).output;
        if (output && Symbol.asyncIterator in Object(output)) {
          for await (const chunk of output as AsyncIterable<Record<string, unknown>>) {
            const delta =
              typeof chunk.content === 'string' ? chunk.content :
              typeof chunk.response === 'string' ? chunk.response : '';
            if (delta) {
              rawContent = delta.startsWith(rawContent) ? delta : rawContent + delta;
            }
          }
        }
      }

      if (!rawContent.trim()) return defaultAnalysis;

      // 尝试解析 JSON 格式的返回
      const jsonMatch = /\{[\s\S]*\}/u.exec(rawContent);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as Partial<FrameAnalysis>;
        return {
          hasText: Boolean(parsed.hasText),
          text: parsed.text ?? '',
          hasChart: Boolean(parsed.hasChart),
          chartDesc: parsed.chartDesc ?? '',
          summary: parsed.summary ?? rawContent.slice(0, 50),
          score: typeof parsed.score === 'number' ? Math.min(5, Math.max(1, parsed.score)) : 2,
        };
      }

      // 无法解析 JSON，用原始文本作为 summary
      return { ...defaultAnalysis, summary: rawContent.slice(0, 80), score: 2 };
    } catch (err) {
      this.logger.warn(`analyzeFrame error: ${String(err)}`);
      return defaultAnalysis;
    }
  }

  /**
   * 判断是否需要生成信息图（替换原截图）
   * 条件：score >= 4 且（有文字 或 有图表）
   */
  private shouldGenerateInfoGraphic(analysis: FrameAnalysis): boolean {
    return analysis.score >= 4 && (analysis.hasText || analysis.hasChart);
  }

  /**
   * 对高价值帧生成 AI 优化信息图
   */
  async generateDerivative(
    frame: KeyFrame,
    analysis: FrameAnalysis,
  ): Promise<string | undefined> {
    const content = analysis.hasText ? analysis.text : analysis.chartDesc;
    if (!content.trim()) return undefined;

    const result = (await this.capabilityService
      .load('frame-infographic-generator')
      .call('textToImage', { content })) as { images?: string[] };

    const imageUrl = result.images?.find(
      (image) => /^https?:\/\//u.test(image) || image.startsWith('/'),
    );
    return imageUrl ? this.resolvePluginImageUrl(imageUrl) : undefined;
  }

  /**
   * 将飞书 image_key 转换为可访问的图片 URL
   * 格式：https://open.feishu.cn/open-apis/im/v1/images/{image_key}
   */
  private buildFeishuImageUrl(imageKey: string): string {
    return `https://open.feishu.cn/open-apis/im/v1/images/${imageKey}`;
  }

  private resolvePluginImageUrl(value: string): string {
    if (/^https?:\/\//u.test(value)) return value;
    const platformBase =
      process.env.MIAODA_DEV_PLATFORM_BASE ||
      process.env.MIAODA_PLATFORM_BASE ||
      '';
    if (!platformBase) return value;
    return new URL(value, platformBase).toString();
  }
}
