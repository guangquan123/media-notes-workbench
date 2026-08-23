import {
  AxiosHeaders,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios';
import { HttpService } from '@nestjs/axios';
import {
  buildDingTalkSign,
  buildFeishuSign,
  buildTaskText,
  isFeishuFailure,
  TaskNotificationService,
  validateDingTalkWebhookUrl,
  validateFeishuWebhookUrl,
} from '../../server/modules/task-notifications/task-notification.service';

const DINGTALK_URL = 'https://oapi.dingtalk.com/robot/send?access_token=test';

function createResponse(data: { code?: number; errcode?: number }): AxiosResponse {
  const config: InternalAxiosRequestConfig = {
    headers: new AxiosHeaders(),
    method: 'post',
    url: DINGTALK_URL,
  };
  return {
    config,
    data,
    headers: new AxiosHeaders(),
    status: 200,
    statusText: 'OK',
  };
}

describe('task notification helpers', () => {
  it('builds signatures and result text', () => {
    expect(buildFeishuSign('1700000000', 'notification-secret')).toBe(
      'lNusHzXQ9tsu8QByULVKsXR7CJ2yQGitnd4DfVypDdk=',
    );
    expect(buildDingTalkSign('1700000000', 'notification-secret')).toBe(
      '+r7lauFLFFkeu1m2mek6/Wgq8oItasy3LU3SM3rJgmE=',
    );
    const text = buildTaskText({
      event: 'completed',
      id: 'task-123',
      message: '任务状态消息',
      type: 'note',
    });
    expect(text).toContain('已完成');
    expect(text).toContain('task-123');
  });

  it('validates allowed robot hosts and recognizes business errors', () => {
    expect(
      validateFeishuWebhookUrl(
        'https://open.feishu.cn/open-apis/bot/v2/hook/test',
      ),
    ).toContain('open.feishu.cn');
    expect(validateDingTalkWebhookUrl(DINGTALK_URL)).toContain('oapi.dingtalk.com');
    expect(() => validateFeishuWebhookUrl('https://example.com/notification')).toThrow('飞书机器人');
    expect(() => validateDingTalkWebhookUrl('https://example.com/robot/send')).toThrow('钉钉');
    expect(isFeishuFailure({ code: 1 })).toBe(true);
    expect(isFeishuFailure({ errcode: 0 })).toBe(false);
  });

  it('sends exactly one notification through the active connector webhook', async () => {
    const httpService = new HttpService();
    const post = jest
      .spyOn(httpService.axiosRef, 'post')
      .mockResolvedValue(createResponse({ errcode: 0 }));
    const registry = {
      getActiveConnector: async () => 'dingtalk' as const,
      getConfig: async () => ({
        type: 'dingtalk' as const,
        webhookSecret: '',
        webhookUrl: DINGTALK_URL,
      }),
    };
    const service = new TaskNotificationService(httpService, registry as never);

    await service.notifyTaskResult({
      event: 'completed',
      id: 'note-123',
      message: '钉钉文档和待办已创建。',
      type: 'note',
    });

    expect(post).toHaveBeenCalled();
    expect(post.mock.calls[0][0]).toContain('oapi.dingtalk.com/robot/send');
    expect(post.mock.calls[0][1]).toEqual(
      expect.objectContaining({
        msgtype: 'text',
        text: expect.objectContaining({
          content: expect.stringContaining('钉钉文档和待办已创建。'),
        }),
      }),
    );
  });

  it('tests the configured connector webhook without a second settings source', async () => {
    const httpService = new HttpService();
    const post = jest
      .spyOn(httpService.axiosRef, 'post')
      .mockResolvedValue(createResponse({ code: 0 }));
    const registry = {
      getConfig: async () => ({
        type: 'feishu' as const,
        webhookSecret: 'test-secret',
        webhookUrl: 'https://open.feishu.cn/open-apis/bot/v2/hook/test',
      }),
    };
    const service = new TaskNotificationService(httpService, registry as never);

    await expect(service.testConnectorWebhook('feishu')).resolves.toMatchObject({
      message: '飞书机器人已连通。',
    });
    expect(post).toHaveBeenCalled();
  });
});
