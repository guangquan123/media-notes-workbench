import {
  getVisualOptionsCopy,
} from '../../client/src/pages/ConversionHistoryPage/conversion-history-visual.utils';

describe('conversion history visual options copy', () => {
  it('makes enabled image processing and its output mode visible', () => {
    expect(
      getVisualOptionsCopy({
        allowExternalAi: true,
        density: 'standard',
        mode: 'automatic',
        outputMode: 'original_with_ai_notes',
      }),
    ).toEqual({
      detail: '标准截图 · 原图 + AI 文字识别 · 自动发布 · 已允许外部 AI',
      enabled: true,
      title: '已启用关键画面',
    });
  });

  it('keeps legacy records explicit when image processing was not enabled', () => {
    expect(getVisualOptionsCopy(undefined)).toEqual({
      detail: '本次任务未请求视频图片处理',
      enabled: false,
      title: '未启用关键画面',
    });
  });
});
