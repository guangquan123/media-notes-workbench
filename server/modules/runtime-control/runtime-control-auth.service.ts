import { ForbiddenException, Injectable } from '@nestjs/common';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';

const CONTROL_COOKIE = 'workbench-control-token';

@Injectable()
export class RuntimeControlAuthService {
  private readonly token: string = randomBytes(32).toString('hex');

  createSession(request: Request, response: Response): { csrfToken: string } {
    this.assertLoopbackRequest(request);
    response.setHeader(
      'Set-Cookie',
      // The local app is mounted below /app/app_xxx in the browser, while the
      // static proxy strips that prefix before forwarding to Nest. A root-
      // scoped cookie is therefore required for the browser to send it back
      // to the mounted control endpoint.
      `${CONTROL_COOKIE}=${this.token}; HttpOnly; SameSite=Strict; Path=/`,
    );
    return { csrfToken: this.token };
  }

  assertAuthorized(request: Request): void {
    this.assertLoopbackRequest(request);
    const cookieToken: string = this.readCookie(request.headers.cookie);
    const headerToken: string = String(
      request.headers['x-workbench-control-token'] || '',
    );
    if (!this.equalToken(cookieToken, this.token) || !this.equalToken(headerToken, this.token)) {
      throw new ForbiddenException('工作台控制会话无效，请刷新页面后重试');
    }
  }

  private assertLoopbackRequest(request: Request): void {
    const remoteAddress: string = (request.socket.remoteAddress || request.ip || '')
      .replace(/^::ffff:/u, '')
      .toLowerCase();
    if (remoteAddress !== '127.0.0.1' && remoteAddress !== '::1' && remoteAddress !== 'localhost') {
      throw new ForbiddenException('仅允许本机控制工作台');
    }
    const origin: string | undefined = request.headers.origin;
    if (!origin) return;
    try {
      const parsed: URL = new URL(origin);
      const hostname: string = parsed.hostname.toLowerCase().replace(/^\[|\]$/gu, '');
      if (!['127.0.0.1', '::1', 'localhost'].includes(hostname)) {
        throw new ForbiddenException('控制请求来源不受信任');
      }
    } catch (error) {
      if (error instanceof ForbiddenException) throw error;
      throw new ForbiddenException('控制请求来源无效');
    }
  }

  private readCookie(header: string | undefined): string {
    if (!header) return '';
    const match: RegExpMatchArray | null = header.match(
      new RegExp(`(?:^|;\\s*)${CONTROL_COOKIE}=([^;]*)`, 'u'),
    );
    return match?.[1] || '';
  }

  private equalToken(left: string, right: string): boolean {
    const leftBuffer: Buffer = Buffer.from(left);
    const rightBuffer: Buffer = Buffer.from(right);
    return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
  }
}
