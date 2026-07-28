import { NestFactory } from '@nestjs/core';
import { CapabilityService } from '@lark-apaas/fullstack-nestjs-core';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { AppModule } from '../server/app.module';

async function main() {
  const imagePath = process.argv[2];
  if (!imagePath) {
    throw new Error(
      '用法: npm run test:frame-plugins -- <不含敏感信息的测试图片路径>',
    );
  }
  const image = await readFile(resolve(imagePath));
  const imageDataUrl = `data:image/png;base64,${image.toString('base64')}`;
  const application = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const capability = application.get(CapabilityService);
    const stream = capability
      .load('frame-image-understanding')
      .callStream('imageUnderstanding', { images: [imageDataUrl] });
    let content = '';
    for await (const chunk of stream as AsyncIterable<{
      content?: string;
      response?: string;
    }>) {
      const delta = chunk.content || chunk.response || '';
      content = delta.startsWith(content) ? delta : content + delta;
    }
    if (!content.trim()) throw new Error('图片理解流式插件返回空内容');

    const generated = (await capability
      .load('frame-infographic-generator')
      .call('textToImage', {
        content: '合成测试：会议完成率 80%，风险事项 2 项。',
      })) as { images?: string[] };
    const generatedUrl = generated.images?.find(
      (url) => /^https?:\/\//u.test(url) || url.startsWith('/'),
    );
    if (!generatedUrl) {
      throw new Error(
        `信息图插件未返回有效图片 URL: ${JSON.stringify(generated).slice(0, 1_000)}`,
      );
    }
    process.stdout.write(
      `${JSON.stringify({
        imageUnderstandingChars: content.length,
        textToImageUrl: generatedUrl,
      })}\n`,
    );
  } finally {
    await application.close().catch(() => undefined);
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.stack || error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
