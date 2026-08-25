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
    expect(script).toContain('htaUrl = "file:///" & Replace(htaPath, "\\", "/") & "#" & action');
    expect(script).toContain('shell.Run Quote(mshtaPath) & " " & Quote(htaUrl), 1, False');
    expect(script).not.toMatch(/run-hidden\.vbs[\s\S]*start:windows/i);
  });

  it('waits for verified services and the browser render acknowledgement before closing', () => {
    const launcher = readFileSync(
      resolve(root, 'scripts', 'workbench-launcher.hta'),
      'utf8',
    );

    expect(launcher).toContain('launcher-ui-ready.token');
    expect(launcher).toContain('servicesReady && !browserLaunchObserved');
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
    expect(devWindows).toContain('operationToken: launcherOperationToken');
    expect(devWindows).toContain(
      '实时输出管道被 Windows 拒绝，已自动切换到日志直写模式继续启动',
    );
    expect(devWindows).toContain("stdio: ['ignore', logFd, logFd]");
    expect(devWindows).toContain('staticClientServer ? null : client');
    expect(devWindows).toContain('staticClientServer ? 15000 : 120000');
    expect(devWindows).toContain(
      'const runtimeUrl = `http://${serverHost}:${serverPort}/api/runtime`;',
    );
    expect(devWindows).toContain('ensureLocalRuntimeConfig(rootDir)');
    expect(devWindows).toContain('runFileOperationWithRetry');
    expect(devWindows).toContain('启动状态文件暂时被占用');
    expect(devWindows).toContain('waitForStaticClientReady');
    expect(devWindows).toContain('STATIC_CLIENT_INSTANCE_TOKEN');
    expect(devWindows).toContain('已接管当前启动窗口，不重复创建实例');
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
