import { FrameInsertionService } from '../../server/modules/note-jobs/frame-insertion.service';
import { KeyFrame } from '../../server/modules/note-jobs/frame-extraction.service';

describe('FrameInsertionService', () => {
  let service: FrameInsertionService;

  beforeEach(() => {
    service = new FrameInsertionService();
  });

  it('should skip insertion if no frames have imageKey', () => {
    const markdown = '# 笔记标题\n\n## 1. 导言\n这是正文内容。';
    const frames: KeyFrame[] = [
      {
        timestamp: 10,
        filePath: '/tmp/f1.jpg',
        id: '1',
        sourceFileName: 'video.mp4',
        sourceIndex: 0,
        type: 'scene',
      },
    ];
    const result = service.insertFramesIntoMarkdown(markdown, frames);
    expect(result).toBe(markdown);
  });

  it('should insert frames into markdown sections with AI annotation', () => {
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

    const result = service.insertFramesIntoMarkdown(markdown, frames, 120);

    expect(result).toContain(
      '![视频原始截图 00:15](https://open.feishu.cn/open-apis/im/v1/images/img_test_123)',
    );
    expect(result).toContain(
      '🤖 **AI 识别**：**文字内容**：PPT: 神经网络架构图',
    );
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
    const imageIndex: number = result.indexOf('img_users');

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

    const result = service.insertFramesIntoMarkdown(markdown, frames, 60);

    expect(result).toContain('img_orig_456');
    expect(result).toContain(
      '![AI 派生信息图 00:45](https://cdn.example.com/infographic.png)',
    );
    expect(result).toContain('原始截图保留在上方');
  });
});
