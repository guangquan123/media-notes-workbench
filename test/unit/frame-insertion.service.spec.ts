import { FrameInsertionService } from '../../server/modules/note-jobs/frame-insertion.service';
import { KeyFrame } from '../../server/modules/note-jobs/frame-extraction.service';

describe('FrameInsertionService', () => {
  let service: FrameInsertionService;

  beforeEach(() => {
    service = new FrameInsertionService();
  });

  it('rejects frames without a local or cached media source', () => {
    const markdown = '# 笔记标题\n\n## 1. 导言\n这是正文内容。';
    const frames: KeyFrame[] = [
      {
        timestamp: 10,
        filePath: '',
        id: '1',
        sourceFileName: 'video.mp4',
        sourceIndex: 0,
        type: 'scene',
      },
    ];
    expect(() => service.insertFramesIntoMarkdown(markdown, frames)).toThrow(
      '缺少本地媒体',
    );
  });

  it('builds native media assets instead of protected image URLs', () => {
    const markdown = `# 深度学习入门笔记\n\n## 1. 神经网络基础\n介绍了输入层和隐藏层。\n\n## 2. 核心算法\n介绍了反向传播与梯度下降。`;
    const frames: KeyFrame[] = [
      {
        timestamp: 15,
        filePath: '/tmp/f1.jpg',
        id: '1',
        sourceFileName: 'video.mp4',
        sourceIndex: 0,
        type: 'scene',
        imageKey: 'img_test_123',
        analysis: {
          hasText: true,
          text: 'PPT: 神经网络架构图',
          hasChart: true,
          chartDesc: '输入层-隐藏层结构',
          summary: '网络架构',
          score: 5,
        },
      },
    ];

    const result = service.buildDocumentDraft(markdown, frames, {
      presentationMode: false,
      totalDurationSec: 120,
    });

    expect(result.markdown).not.toContain(
      'https://open.feishu.cn/open-apis/im/v1/images/',
    );
    expect(result.markdown).toContain('图 1：视频原始截图（00:15）');
    expect(result.markdown).toContain(
      '🤖 **AI 识别**：**文字内容**：PPT: 神经网络架构图',
    );
    expect(result.media).toEqual([
      expect.objectContaining({
        anchor: '图 1：视频原始截图（00:15）',
        caption: '视频原始截图 00:15',
        source: { kind: 'file', path: '/tmp/f1.jpg' },
      }),
    ]);
  });

  it('places an analyzed frame beside the semantically matching section', () => {
    const markdown = `# 智能体培训

## 一、知识图谱生成
介绍模型版本、节点关系和知识图谱画布。

## 二、平台用户管理
介绍用户导入、账号激活和权限配置。`;
    const frames: KeyFrame[] = [
      {
        timestamp: 5,
        filePath: '/tmp/users.jpg',
        id: 'users',
        sourceFileName: 'video.mp4',
        sourceIndex: 0,
        type: 'scene',
        imageKey: 'img_users',
        analysis: {
          hasText: true,
          text: '平台用户导入与账号激活界面',
          hasChart: false,
          chartDesc: '',
          summary: '用户管理和权限配置',
          score: 5,
        },
      },
    ];

    const result = service.insertFramesIntoMarkdown(markdown, frames, 120);
    const imageIndex: number = result.indexOf('视频原始截图（00:05）');

    expect(imageIndex).toBeGreaterThan(result.indexOf('## 二、平台用户管理'));
    expect(imageIndex).toBeLessThan(result.indexOf('介绍用户导入'));
  });

  it('should format infoGraphic frames with AI optimized badge', () => {
    const markdown = `# 笔记标题\n\n## 1. 架构总结\n总结内容`;
    const frames: KeyFrame[] = [
      {
        timestamp: 45,
        filePath: '/tmp/f2.jpg',
        id: '2',
        sourceFileName: 'video.mp4',
        sourceIndex: 0,
        type: 'scene',
        imageKey: 'img_orig_456',
        derivativeUrl: 'https://cdn.example.com/infographic.png',
        analysis: {
          hasText: true,
          text: '核心公式：E=mc^2',
          hasChart: false,
          chartDesc: '',
          summary: '质能方程',
          score: 5,
        },
      },
    ];

    const result = service.buildDocumentDraft(markdown, frames, {
      presentationMode: false,
      totalDurationSec: 60,
    });

    expect(result.markdown).not.toContain('img_orig_456');
    expect(result.markdown).not.toContain(
      'https://cdn.example.com/infographic.png',
    );
    expect(result.markdown).toContain('原始截图保留在上方');
    expect(result.media).toHaveLength(2);
    expect(result.media[1]).toEqual(
      expect.objectContaining({
        source: {
          kind: 'remote-url',
          url: 'https://cdn.example.com/infographic.png',
        },
      }),
    );
  });

  it('records every presentation page in order with complete OCR text', () => {
    const fullText = `第 7 页\n${'供应链流程与数据口径。'.repeat(30)}`;
    const frames: KeyFrame[] = [
      {
        analysis: {
          chartDesc: '',
          hasChart: false,
          hasText: true,
          isPresentationSlide: true,
          score: 5,
          summary: '供应链流程',
          text: fullText,
        },
        filePath: '/tmp/slide-7.png',
        id: 'slide-7',
        imageKey: 'img_slide_7',
        sourceFileName: 'training.mp4',
        sourceIndex: 0,
        timestamp: 70,
        type: 'scene',
      },
      {
        analysis: {
          chartDesc: '数据驾驶舱页面',
          hasChart: true,
          hasText: true,
          isPresentationSlide: true,
          score: 5,
          summary: '数据驾驶舱',
          text: '第 8 页',
        },
        filePath: '/tmp/slide-8.png',
        id: 'slide-8',
        imageKey: 'img_slide_8',
        sourceFileName: 'training.mp4',
        sourceIndex: 0,
        timestamp: 80,
        type: 'scene',
      },
    ];

    const result = service.buildDocumentDraft('# 培训笔记', frames, {
      presentationMode: true,
    });

    expect(result.markdown).toContain('## 培训课件逐页记录');
    expect(result.markdown).toContain('### 第 1 页（01:10）');
    expect(result.markdown).toContain('### 第 2 页（01:20）');
    expect(result.markdown).toContain(fullText.replace(/\n/g, ' '));
    expect(result.media.map((asset) => asset.source)).toEqual([
      { kind: 'file', path: '/tmp/slide-7.png' },
      { kind: 'file', path: '/tmp/slide-8.png' },
    ]);
  });

  it('should keep inserting frames when a timestamp is not finite', () => {
    const markdown = `# 笔记标题\n\n## 1. 第一章\n第一章内容\n\n## 2. 第二章\n第二章内容`;
    const frames: KeyFrame[] = [
      {
        timestamp: Number.NaN,
        globalTimestamp: Number.NaN,
        filePath: '/tmp/invalid-timestamp.jpg',
        id: 'invalid-timestamp',
        sourceFileName: 'video.mp4',
        sourceIndex: 0,
        type: 'scene',
        imageKey: 'img_invalid_timestamp',
      },
    ];

    const result = service.insertFramesIntoMarkdown(markdown, frames);

    expect(result).toContain('视频原始截图（00:00）');
  });
});
