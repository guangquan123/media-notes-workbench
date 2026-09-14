import * as childProcess from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import * as runtimeConfig from '../../server/modules/runtime/runtime.config';
import { RuntimeControlService } from '../../server/modules/runtime-control/runtime-control.service';
import type { NoteJobsService } from '../../server/modules/note-jobs/note-jobs.service';

describe('runtime control service', () => {
  const getActiveTaskCount = jest.fn< number, [] >();
  let service: RuntimeControlService;
  let spawnSpy: jest.SpyInstance;
  let localSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers();
    localSpy = jest.spyOn(runtimeConfig, 'isLocalRuntime').mockReturnValue(true);
    spawnSpy = jest.spyOn(childProcess, 'spawn').mockReturnValue({
      once: jest.fn(),
      unref: jest.fn(),
    } as unknown as ChildProcessWithoutNullStreams);
    getActiveTaskCount.mockReturnValue(2);
    service = new RuntimeControlService({ getActiveTaskCount } as unknown as NoteJobsService);
  });

  afterEach(() => {
    jest.useRealTimers();
    spawnSpy.mockRestore();
    localSpy.mockRestore();
    getActiveTaskCount.mockReset();
  });

  it('supports scheduling, cancelling, and idempotently repeating a drain stop', () => {
    expect(service.requestStop({ mode: 'after_tasks' }).status).toBe('draining');
    expect(service.requestStop({ mode: 'after_tasks' }).status).toBe('draining');
    expect(service.getStatus()).toMatchObject({
      activeTaskCount: 2,
      scheduledStop: true,
      state: 'draining',
    });

    expect(service.cancelScheduledStop()).toMatchObject({
      scheduledStop: false,
      state: 'ready',
    });
    expect(spawnSpy).not.toHaveBeenCalled();
  });

  it('starts the stop command after an immediate request and rejects restart while stopping', () => {
    expect(service.requestStop({ mode: 'immediate' }).status).toBe('accepted');
    expect(service.getStatus().state).toBe('stopping');
    expect(() => service.requestRestart()).toThrow('正在停止');

    jest.advanceTimersByTime(500);
    expect(spawnSpy).toHaveBeenCalledTimes(1);
  });

  it('rejects restart while active tasks are running', () => {
    expect(() => service.requestRestart()).toThrow(
      '当前有 2 个任务正在处理，请等待任务完成后再重启',
    );
    expect(spawnSpy).not.toHaveBeenCalled();
  });

  it('accepts restart when no tasks are active', () => {
    getActiveTaskCount.mockReturnValue(0);
    expect(service.requestRestart().status).toBe('accepted');
    expect(service.getStatus().state).toBe('stopping');
    jest.advanceTimersByTime(500);
    expect(spawnSpy).toHaveBeenCalledTimes(1);
  });
});
