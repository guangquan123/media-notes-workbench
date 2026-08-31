import {
  describeBackendFailure,
  nextBackendHealthState,
} from '../../client/src/lib/backend-health';

describe('backend health state', () => {
  it('requires consecutive failures before declaring the backend unavailable', () => {
    const firstFailure = nextBackendHealthState(
      { consecutiveFailures: 0, unavailable: false },
      false,
    );
    expect(firstFailure).toEqual({
      consecutiveFailures: 1,
      unavailable: false,
    });
    expect(nextBackendHealthState(firstFailure, false)).toEqual({
      consecutiveFailures: 2,
      unavailable: true,
    });
  });

  it('recovers immediately after a successful probe', () => {
    expect(
      nextBackendHealthState(
        { consecutiveFailures: 4, unavailable: true },
        true,
      ),
    ).toEqual({ consecutiveFailures: 0, unavailable: false });
  });

  it('extracts safe HTTP diagnostics without exposing a stack trace', () => {
    expect(
      describeBackendFailure({
        code: 'ERR_BAD_RESPONSE',
        message: 'Request failed with status code 502',
        response: {
          data: {
            message: '后端暂不可用',
            stack: 'sensitive stack',
          },
          status: 502,
        },
      }),
    ).toBe('HTTP 502 · ERR_BAD_RESPONSE · 后端暂不可用');
  });
});
