import { ForbiddenException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { RuntimeControlAuthService } from '../../server/modules/runtime-control/runtime-control-auth.service';

interface RequestOptions {
  cookie?: string;
  origin?: string;
  remoteAddress?: string;
  token?: string;
}

function buildRequest(options: RequestOptions = {}): Request {
  return {
    headers: {
      cookie: options.cookie,
      origin: options.origin,
      'x-workbench-control-token': options.token,
    },
    ip: options.remoteAddress || '127.0.0.1',
    socket: { remoteAddress: options.remoteAddress || '127.0.0.1' },
  } as Request;
}

describe('runtime control authorization', () => {
  it('requires a same-session cookie and token for a loopback request', () => {
    const service = new RuntimeControlAuthService();
    const setHeader = jest.fn();
    const session = service.createSession(
      buildRequest({ origin: 'http://127.0.0.1:8081' }),
      { setHeader } as unknown as Response,
    );

    expect(setHeader).toHaveBeenCalledWith(
      'Set-Cookie',
      expect.stringContaining('HttpOnly; SameSite=Strict; Path=/'),
    );
    expect(() =>
      service.assertAuthorized(
        buildRequest({
          cookie: `workbench-control-token=${session.csrfToken}`,
          origin: 'http://localhost:8081',
          token: session.csrfToken,
        }),
      ),
    ).not.toThrow();
  });

  it('rejects missing tokens, non-loopback callers, and untrusted origins', () => {
    const service = new RuntimeControlAuthService();
    const session = service.createSession(buildRequest(), {
      setHeader: jest.fn(),
    } as unknown as Response);

    expect(() => service.assertAuthorized(buildRequest())).toThrow(
      ForbiddenException,
    );
    expect(() =>
      service.assertAuthorized(
        buildRequest({
          cookie: `workbench-control-token=${session.csrfToken}`,
          remoteAddress: '10.0.0.8',
          token: session.csrfToken,
        }),
      ),
    ).toThrow(ForbiddenException);
    expect(() =>
      service.assertAuthorized(
        buildRequest({
          cookie: `workbench-control-token=${session.csrfToken}`,
          origin: 'https://example.com',
          token: session.csrfToken,
        }),
      ),
    ).toThrow(ForbiddenException);
  });
});
