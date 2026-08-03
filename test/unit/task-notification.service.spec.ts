import { createHmac } from 'node:crypto';
import {
  AxiosHeaders,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';
import { HttpService } from '@nestjs/axios';
import {
  buildFeishuSign,
  buildTaskText,
  isFeishuFailure,
  TaskNotificationService,
  validateFeishuWebhookUrl,
} from '../../server/modules/task-notifications/task-notification.service';

describe('task notification helpers', () => {
  it('builds the Feishu signature from timestamp and secret', () => {
    const timestamp: string = '1700000000';
    const secret: string = 'notification-secret';
    const expected: string = createHmac('sha256', secret)
      .update(`${timestamp}\n${secret}`)
      .digest('base64');

    expect(buildFeishuSign(timestamp, secret)).toBe(expected);
  });

  it.each([
    ['completed', '已完成'],
    ['failed', '失败'],
    ['cancelled', '已取消'],
  ] as const)('includes the %s result in the Feishu text', (event, label) => {
    const text: string = buildTaskText({
      event,
      id: 'task-123',
      message: '任务状态消息',
      type: 'note',
    });

    expect(text).toContain(label);
    expect(text).toContain('task-123');
  });

  it('includes an error and result link without exposing source content', () => {
    const text: string = buildTaskText({
      error: '转录服务不可用',
      event: 'failed',
      id: 'task-456',
      message: '处理失败',
      resultUrl: 'https://feishu.cn/docx/result',
      title: '会议记录',
      type: 'article-export',
    });

    expect(text).toContain('转录服务不可用');
    expect(text).toContain('https://feishu.cn/docx/result');
    expect(text).not.toContain('完整转录稿');
  });

  it('recognizes Feishu business errors even when HTTP is successful', () => {
    expect(isFeishuFailure({ code: 999 })).toBe(true);
    expect(isFeishuFailure({ StatusCode: 1 })).toBe(true);
    expect(isFeishuFailure({ code: 0 })).toBe(false);
    expect(isFeishuFailure({ StatusCode: 0 })).toBe(false);
    expect(isFeishuFailure('success')).toBe(false);
  });

  it('accepts only Feishu or Lark robot webhook addresses', () => {
    expect(
      validateFeishuWebhookUrl(
        'https://open.feishu.cn/open-apis/bot/v2/hook/test',
      ),
    ).toContain('open.feishu.cn');
    expect(() =>
      validateFeishuWebhookUrl('https://example.com/notification'),
    ).toThrow('飞书机器人');
    expect(() =>
      validateFeishuWebhookUrl(
        'http://open.feishu.cn/open-apis/bot/v2/hook/test',
      ),
    ).toThrow('https');
  });

  it('sends a signed Feishu text message for an unsaved webhook test', async () => {
    const httpService: HttpService = new HttpService();
    const config: InternalAxiosRequestConfig = {
      headers: new AxiosHeaders(),
      method: 'post',
      url: 'https://open.feishu.cn/open-apis/bot/v2/hook/test',
    };
    const response: AxiosResponse<{ code: number }> = {
      config,
      data: { code: 0 },
      headers: new AxiosHeaders(),
      status: 200,
      statusText: 'OK',
    };
    const post = jest
      .spyOn(httpService.axiosRef, 'post')
      .mockResolvedValue(response);
    const service: TaskNotificationService = new TaskNotificationService(
      httpService,
    );

    const result = await service.testInput({
      enabled: true,
      name: '测试机器人',
      secret: 'test-secret',
      url: 'https://open.feishu.cn/open-apis/bot/v2/hook/test',
    });

    expect(result.message).toBe('飞书机器人已连通。');
    expect(post).toHaveBeenCalledTimes(1);
    const body: {
      content: { text: string };
      msg_type: string;
      sign?: string;
      timestamp?: string;
    } = post.mock.calls[0][1];
    expect(body.msg_type).toBe('text');
    expect(body.content.text).toContain('连通性测试成功');
    expect(body.timestamp).toEqual(expect.any(String));
    expect(body.sign).toEqual(expect.any(String));
  });

});
