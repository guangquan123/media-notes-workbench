import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('Windows launcher entry', () => {
  const root = resolve(__dirname, '../..');

  it('opens the visible progress launcher instead of starting the service hidden', () => {
    const script = readFileSync(
      resolve(root, '启动多媒体笔记工作台.vbs'),
      'utf8',
    );

    expect(script).toMatch(/workbench-launcher\.hta/i);
    expect(script).toContain('action = "start"');
    expect(script).toContain(
      'htaUrl = "file:///" & Replace(htaPath, "\\", "/") & "#" & action',
    );
    expect(script).toContain(
      'shell.Run Quote(mshtaPath) & " " & Quote(htaUrl), 1, False',
    );
    expect(script).not.toMatch(/run-hidden\.vbs[\s\S]*start:windows/i);
  });

  it('waits for verified services and the browser render acknowledgement before closing', () => {
    const launcher = readFileSync(
      resolve(root, 'scripts', 'workbench-launcher.hta'),
      'utf8',
    );

    expect(launcher).toContain('launcher-ui-ready.token');
    expect(launcher).toContain('servicesReady && !browserLaunchObserved');
    expect(launcher).toContain(
      'var servicesReady = restartReadyTokenMatches() && api;',
    );
    expect(
      (launcher.match(/browserLaunchObserved && uiReady/g) || []).length,
    ).toBe(2);
    expect(launcher).toContain('等待浏览器完成页面渲染');
    expect(launcher).toContain('var startupDeadline = 300000;');
    expect(launcher).toContain('var pageReadyDeadline = 30000;');
    expect(launcher).toContain('本地服务已经启动并验证可访问');
    expect(launcher).toContain('不需要重复启动服务');
    expect(launcher).toContain('complete(readyMessage, false, true)');
    expect(launcher).toContain('setText("eyebrow", "SERVICE READY")');
    expect(launcher).toContain('explorer.exe ');
    expect(launcher).not.toContain(
      'complete("启动完成，正在打开工作台", true)',
    );
    expect(launcher).not.toContain(
      'complete("重启完成，正在打开工作台", true)',
    );
  });

  it('shows the matching structured startup failure immediately instead of waiting for timeout', () => {
    const launcher = readFileSync(
      resolve(root, 'scripts', 'workbench-launcher.hta'),
      'utf8',
    );
    const devWindows = readFileSync(
      resolve(root, 'scripts', 'dev-windows.js'),
      'utf8',
    );

    expect(launcher).toContain('launcher-failure.json');
    expect(launcher).toContain('readLauncherFailure()');
    expect(launcher).toContain('startupFailure.stage || "启动失败"');
    expect(launcher).toContain('formatLauncherFailure(startupFailure)');
    expect(devWindows).toContain('Windows 暂时拒绝创建启动进程');
    expect(devWindows).toContain('后端构建进程创建受阻，2 秒后自动重试');
    expect(devWindows).toContain('writeLauncherFailure(error)');
    expect(devWindows).toContain('启动进程意外退出，请查看日志确认具体原因。');
    expect(devWindows).toContain(
      '在启动完成前意外退出，请查看日志确认具体原因。',
    );
    expect(devWindows).toContain('operationToken: currentOperationToken');
    expect(devWindows).toContain(
      '实时输出管道被 Windows 拒绝，已自动切换到日志直写模式继续启动',
    );
    expect(devWindows).toContain("stdio: ['ignore', logFd, logFd]");
    expect(devWindows).toContain("'--configLoader', 'native'");
    expect(devWindows).toContain("process.platform === 'win32'");
    expect(devWindows).toContain("!process.argv.includes('--vite-client')");
    expect(devWindows).toContain('Windows 稳定模式使用静态前端资源');
    expect(devWindows).toContain('isServerBuildCurrent');
    expect(devWindows).toContain('后端构建产物已是最新，跳过构建');
    expect(devWindows).toContain('[clientIndexPath, fallbackIndex]');
    expect(devWindows).toContain(
      '.sort((left, right) => right.outputMtime - left.outputMtime)',
    );
    expect(devWindows).toContain(
      'if (!useStaticClient) fs.rmSync(clientIndexPath, { force: true })',
    );
    expect(devWindows).toContain('await waitForApplicationReady(client, 8000)');
    expect(devWindows).toContain('前端页面验证失败，切换到静态前端兜底服务');
    expect(devWindows).toContain('await waitForApplicationReady(null, 15000)');
    expect(devWindows).toContain('const runtimeUrl = `${appUrl}api/runtime`;');
    expect(devWindows).toContain(
      'const readinessUrl = `${appUrl}api/note-jobs/readiness`;',
    );
    expect(devWindows).toContain(
      'Probe the browser-facing origin/path so proxy and base-path failures are',
    );
    expect(devWindows).toContain('inspectApplicationReadiness');
    expect(devWindows).toContain('最后检测结果');
    expect(devWindows).toContain('uncaughtExceptionMonitor');
    expect(devWindows).toContain('运行期后台失败');
    expect(devWindows).toContain('ensureLocalRuntimeConfig(rootDir)');
    expect(devWindows).toContain('runFileOperationWithRetry');
    expect(devWindows).toContain('启动状态文件暂时被占用');
    expect(devWindows).toContain('waitForStaticClientReady');
    expect(devWindows).toContain('STATIC_CLIENT_INSTANCE_TOKEN');
    expect(devWindows).toContain('已验证项目服务可用');
    expect(devWindows).toContain('项目正在启动');
    expect(devWindows).toContain('为避免假启动已停止');
    expect(devWindows).toContain('resolveExistingLauncherState');
  });
  it('does not create a second instance when the previous service cannot be stopped', () => {
    const restart = readFileSync(
      resolve(root, 'scripts', 'restart-windows.js'),
      'utf8',
    );
    const stop = readFileSync(resolve(root, 'scripts', 'stop.js'), 'utf8');
    const launch = readFileSync(
      resolve(root, 'scripts', 'launch-windows.js'),
      'utf8',
    );

    expect(restart).toContain(
      'if (stopResult.error || stopResult.status !== 0)',
    );
    expect(restart).toContain('旧服务未能完全停止，已取消本次重启');
    expect(restart).toContain('writeLauncherFailure({');
    expect(stop).toContain("error?.code === 'ESRCH'");
    expect(stop).toContain("error?.code !== 'EPERM'");
    expect(stop).toContain('inspectWindowsLauncherProcess');
    expect(stop).toContain("inspection.ownership === 'stale'");
    expect(stop).toContain("inspection.ownership === 'unknown'");
    expect(stop).toContain('未停止该进程');
    expect(launch).toContain("child.once('error'");
  });

  it('proxies local Vite API requests to the real backend without the app prefix', () => {
    const viteConfig = readFileSync(resolve(root, 'vite.config.ts'), 'utf8');

    expect(viteConfig).toContain('[localApiPrefix]');
    expect(viteConfig).toContain('target: localApiTarget');
    expect(viteConfig).toContain('requestPath.slice(clientBasePath.length)');
  });

  it('makes the mounted React layout acknowledge the one-time launcher token', () => {
    const layout = readFileSync(
      resolve(root, 'client', 'src', 'components', 'Layout.tsx'),
      'utf8',
    );

    expect(layout).toContain('/api/runtime/launcher-ready?token=');
    expect(layout).toContain('window.requestAnimationFrame');
    expect(layout).toContain('data-launcher-page-ready="true"');
  });
});
