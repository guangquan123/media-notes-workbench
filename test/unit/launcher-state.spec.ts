const {
  buildLauncherProgress,
  classifyLauncherFailure,
  getLauncherStageProgress,
  isLauncherProgressStale,
} = require('../../scripts/launcher-state.js');

describe('launcher state helpers', () => {
  it('maps a stage-local fraction to a bounded weighted progress value', () => {
    expect(getLauncherStageProgress('backend', 0)).toBe(25);
    expect(getLauncherStageProgress('backend', 0.5)).toBe(37.5);
    expect(getLauncherStageProgress('backend', 2)).toBe(50);
    expect(getLauncherStageProgress('unknown', 0.5)).toBe(0);
  });

  it('builds a progress payload with operation correlation and heartbeat data', () => {
    expect(
      buildLauncherProgress({
        operationToken: 'op-1',
        stage: 'frontend',
        message: '正在验证页面资源',
        fraction: 0.4,
        attempt: 2,
        now: 1234,
      }),
    ).toEqual({
      operationToken: 'op-1',
      stage: 'frontend',
      stageProgress: 58,
      percent: 58,
      message: '正在验证页面资源',
      attempt: 2,
      timestamp: 1234,
    });
  });

  it('marks missing or old progress as stale', () => {
    expect(isLauncherProgressStale(null, 10_000, 5_000)).toBe(true);
    expect(
      isLauncherProgressStale({ timestamp: 8_000 }, 10_000, 5_000),
    ).toBe(false);
    expect(
      isLauncherProgressStale({ timestamp: 1_000 }, 10_000, 5_000),
    ).toBe(true);
  });

  it('classifies actionable startup failures', () => {
    expect(
      classifyLauncherFailure({
        code: 'EADDRINUSE',
        stage: '启动后端',
        message: '端口已被占用',
      }),
    ).toMatchObject({
      code: 'PORT_OCCUPIED',
      title: '所需端口已被其他程序占用',
      actions: ['retry', 'openLogs', 'close'],
    });
    expect(
      classifyLauncherFailure({
        code: 'EPERM',
        stage: '启动后端',
        message: 'spawn EPERM',
      }),
    ).toMatchObject({
      code: 'PROCESS_ACCESS_DENIED',
      actions: ['retry', 'openLogs', 'close'],
    });
    expect(
      classifyLauncherFailure({
        code: 'UI_ACK_TIMEOUT',
        stage: '打开工作台',
        message: '浏览器未确认页面渲染',
      }),
    ).toMatchObject({
      code: 'UI_ACK_TIMEOUT',
      actions: ['openWorkbench', 'continueWaiting', 'openLogs', 'close'],
    });
  });
});
