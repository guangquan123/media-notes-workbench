import {
  getCliEnvironment,
  hasBundledLarkCli,
  hasKnownDeadLoopbackProxy,
  resolveCliInvocation,
} from '../../server/common/utils/cli-command';

describe('connector CLI environment', () => {
  const originalHttpProxy = process.env.HTTP_PROXY;
  const originalHttpsProxy = process.env.HTTPS_PROXY;
  const originalAllProxy = process.env.ALL_PROXY;

  afterEach(() => {
    process.env.HTTP_PROXY = originalHttpProxy;
    process.env.HTTPS_PROXY = originalHttpsProxy;
    process.env.ALL_PROXY = originalAllProxy;
  });

  it('removes only the known dead loopback proxy from child CLI environments', () => {
    process.env.HTTP_PROXY = 'http://127.0.0.1:9';
    process.env.HTTPS_PROXY = 'http://127.0.0.1:9';
    process.env.ALL_PROXY = 'http://127.0.0.1:9';

    const environment = getCliEnvironment();

    expect(environment.HTTP_PROXY).toBeUndefined();
    expect(environment.HTTPS_PROXY).toBeUndefined();
    expect(environment.ALL_PROXY).toBeUndefined();
    expect(hasKnownDeadLoopbackProxy()).toBe(true);
  });

  it('keeps a configured non-loopback proxy intact', () => {
    process.env.HTTPS_PROXY = 'http://proxy.example.test:8080';

    expect(getCliEnvironment().HTTPS_PROXY).toBe(
      'http://proxy.example.test:8080',
    );
    expect(
      hasKnownDeadLoopbackProxy({
        HTTPS_PROXY: 'http://proxy.example.test:8080',
      }),
    ).toBe(false);
  });

  it('uses the bundled Lark CLI with the active Node runtime', () => {
    const invocation = resolveCliInvocation('lark-cli.cmd', ['--version']);

    expect(hasBundledLarkCli()).toBe(true);
    expect(invocation.command).toBe(process.execPath);
    expect(invocation.args).toEqual(
      expect.arrayContaining([
        '--version',
        expect.stringContaining('node_modules'),
      ]),
    );
  });
});
