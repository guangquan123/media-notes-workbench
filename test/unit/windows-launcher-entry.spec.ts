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

  it('uses the installed runtime and keeps browser ownership in the HTA', () => {
    const launcher = readFileSync(
      resolve(root, 'scripts', 'workbench-launcher.hta'),
      'utf8',
    );
    const installedLauncher = readFileSync(
      resolve(root, 'scripts', 'installed-launcher.js'),
      'utf8',
    );

    expect(launcher).toContain('installedRuntime');
    expect(launcher).toContain('runtime\\\\node.exe');
    expect(launcher).toContain('installed-launcher.js');
    expect(launcher).toContain('WORKBENCH_LAUNCHER_UI');
    expect(installedLauncher).toContain(
      "process.env.WORKBENCH_LAUNCHER_UI === '1'",
    );
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

  it('stops waiting when the installed service launcher exits before readiness', () => {
    const installedLauncher = readFileSync(
      resolve(root, 'scripts', 'installed-launcher.js'),
      'utf8',
    );

    expect(installedLauncher).toContain("child.once('exit'");
    expect(installedLauncher).toContain('服务进程在工作台就绪前退出');
    expect(installedLauncher).toContain('await waitForReady(5000)');
    expect(installedLauncher).toContain('const readinessController = new AbortController()');
    expect(installedLauncher).toContain('readinessController.abort()');
    expect(installedLauncher).toContain('!signal?.aborted');
  });

  it('runs installed stop logic in the current temporary Node process', () => {
    const installedStop = readFileSync(
      resolve(root, 'scripts', 'installed-stop.js'),
      'utf8',
    );

    expect(installedStop).toContain('WORKBENCH_RUNTIME_NODE = runtimeNode');
    expect(installedStop).toContain("require('./stop.js')");
    expect(installedStop).not.toContain('spawnSync');
  });

  it('waits for legacy hidden uninstall commands before files are removed', () => {
    const runHidden = readFileSync(
      resolve(root, 'scripts', 'run-hidden.vbs'),
      'utf8',
    );

    expect(runHidden).toContain('waitForExit = False');
    expect(runHidden).toContain('LCase(WScript.Arguments(index))');
    expect(runHidden).toContain('"installed-stop.js"');
    expect(runHidden).toContain('fileSystem.GetSpecialFolder(2)');
    expect(runHidden).toContain('fileSystem.CopyFile executablePath, tempExecutable, True');
    expect(runHidden).toContain('If Not fileSystem.FileExists(executablePath) Then');
    expect(runHidden).toContain('WScript.Quit 3');
    expect(runHidden).toContain('WScript.Quit 4');
    expect(runHidden).toContain('exitCode = 5');
    expect(runHidden).toContain('If tempCreated Then');
    expect(runHidden).toContain('fileSystem.DeleteFile tempExecutable, True');
    expect(runHidden).toContain('shell.Run(commandLine, 0, waitForExit)');
  });

  it('opens the per-user log directory after creating it on demand', () => {
    const openLogs = readFileSync(
      resolve(root, 'scripts', 'open-logs.vbs'),
      'utf8',
    );

    expect(openLogs).toContain('ExpandEnvironmentStrings("%LOCALAPPDATA%")');
    expect(openLogs).toContain('Sub EnsureFolder(folderPath)');
    expect(openLogs).toContain('EnsureFolder logsFolder');
    expect(openLogs).toContain('fileSystem.CreateFolder folderPath');
    expect(openLogs).toContain('explorer.exe ');
  });

  it('does not create a second instance when the previous service cannot be stopped', () => {
    const restart = readFileSync(
      resolve(root, 'scripts', 'restart-windows.js'),
      'utf8',
    );
    const stop = readFileSync(resolve(root, 'scripts', 'stop.js'), 'utf8');
    const launcherProcess = readFileSync(
      resolve(root, 'scripts', 'launcher-process.js'),
      'utf8',
    );
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
    expect(stop).toContain('inspection.sameRuntime');
    expect(stop).toContain(
      'nodePath: process.env.WORKBENCH_RUNTIME_NODE || process.execPath',
    );
    expect(stop).toContain('按项目端口定向停止');
    expect(stop).toContain('waitForProcessExit');
    expect(stop).toContain('tasklist.exe');
    expect(stop).toContain("return { method: 'taskkill-retry', stopped: true }");
    expect(stop).toContain('停止命令已发送，但进程仍未退出');
    expect(stop).toContain("inspection.ownership !== 'owned'");
    expect(stop).toContain('避免误停止其他程序');
    expect(stop).toContain('未停止该进程');
    expect(launcherProcess).toContain('static-client.js');
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

  it('keeps the recording asset background flag optional for Nest bootstrap', () => {
    const service = readFileSync(
      resolve(root, 'server', 'modules', 'recording-assets', 'recording-assets.service.ts'),
      'utf8',
    );

    expect(service).toContain('@Optional() backgroundEnabled = true');
  });

  it('does not overwrite a structured startup failure during process exit', () => {
    const devWindows = readFileSync(
      resolve(root, 'scripts', 'dev-windows.js'),
      'utf8',
    );

    expect(devWindows).toContain('!fs.existsSync(launcherFailurePath)');
  });

  it('does not trust directory mtimes for server freshness during launcher startup', () => {
    const devWindows = readFileSync(
      resolve(root, 'scripts', 'dev-windows.js'),
      'utf8',
    );

    expect(devWindows).toContain('构建后端以确保运行产物与源码一致');
    expect(devWindows).not.toContain("后端构建产物已是最新，跳过构建");
  });

  it('reuses a valid static client bundle when a Windows helper process is unavailable', () => {
    const devWindows = readFileSync(
      resolve(root, 'scripts', 'dev-windows.js'),
      'utf8',
    );

    expect(devWindows).toContain('已发现可用客户端静态产物，跳过启动时重建');
    expect(devWindows).toContain('getStaticClientAssetPaths()?.bundlePath');
  });

  it('publishes a small atomic progress state for the launcher UI', () => {
    const devWindows = readFileSync(
      resolve(root, 'scripts', 'dev-windows.js'),
      'utf8',
    );
    const launcher = readFileSync(
      resolve(root, 'scripts', 'workbench-launcher.hta'),
      'utf8',
    );

    expect(devWindows).toContain("launcher-progress.json");
    expect(devWindows).toContain('writeLauncherProgress(message)');
    expect(devWindows).toContain('fs.renameSync(temporaryPath, launcherProgressPath)');
    expect(launcher).toContain('function readLauncherProgress()');
    expect(launcher).toContain('readLauncherProgress()');
  });

  it('publishes weighted stage progress and detects stale heartbeats', () => {
    const devWindows = readFileSync(
      resolve(root, 'scripts', 'dev-windows.js'),
      'utf8',
    );
    const launcher = readFileSync(
      resolve(root, 'scripts', 'workbench-launcher.hta'),
      'utf8',
    );

    expect(devWindows).toContain("require('./launcher-state.js')");
    expect(devWindows).toContain('stageProgress');
    expect(devWindows).toContain('percent');
    expect(launcher).toContain('isLauncherProgressStale');
    expect(launcher).toContain('启动状态暂时没有更新');
  });

  it('probes backend, frontend, and API endpoints in parallel', () => {
    const launcher = readFileSync(
      resolve(root, 'scripts', 'workbench-launcher.hta'),
      'utf8',
    );
    const pollStart = launcher.indexOf('function poll()');
    const retryStart = launcher.indexOf('function retry()', pollStart);
    const poll = launcher.slice(pollStart, retryStart);

    expect(poll).toContain('probeTargets');
    expect(poll).toContain('probeCompleted');
    expect(poll).toContain('httpRequestAsync(serverUrl()');
    expect(poll).toContain('httpRequestAsync(workbenchUrl()');
    expect(poll).toContain('httpRequestAsync(runtimeUrl()');
    expect(poll).toContain('finishPollCycle(snapshot)');
    expect(poll).not.toContain('httpRequestAsync(serverUrl(), function(backendResponse) {\n      snapshot.backend');
  });

  it('fails fast when the HTTP probing ActiveX component is unavailable', () => {
    const launcher = readFileSync(
      resolve(root, 'scripts', 'workbench-launcher.hta'),
      'utf8',
    );

    expect(launcher).toContain('probeUnavailable');
    expect(launcher).toContain('无法检查本地服务');
    expect(launcher).toContain('Windows 启动组件不可用');
  });

  it('offers a copyable diagnostic action on startup failure', () => {
    const launcher = readFileSync(
      resolve(root, 'scripts', 'workbench-launcher.hta'),
      'utf8',
    );

    expect(launcher).toContain('copyDiagnostics');
    expect(launcher).toContain('复制诊断信息');
    expect(launcher).toContain('window.clipboardData');
  });

  it('keeps the HTA responsive while probing unavailable services', () => {
    const launcher = readFileSync(
      resolve(root, 'scripts', 'workbench-launcher.hta'),
      'utf8',
    );
    const pollStart = launcher.indexOf('function poll()');
    const retryStart = launcher.indexOf('function retry()', pollStart);
    const poll = launcher.slice(pollStart, retryStart);

    expect(launcher).toContain('function httpRequestAsync(target, callback)');
    expect(launcher).toContain('request.open("GET", target, true)');
    expect(launcher).toContain('request.abort()');
    expect(launcher).toContain('var probeInFlight = false;');
    expect(launcher).toContain('var probeTimeoutMs = 1800;');
    expect(launcher).not.toContain('function httpRequest(target)');
    expect(launcher).not.toContain('function launcherActive()');
    expect(poll).not.toContain('httpRequest(');
    expect(poll).not.toContain('launcherActive()');
    expect(poll).toContain('if (probeInFlight)');
    expect(poll).toContain('finishPollCycle(snapshot)');
  });

  it('keeps build waits bounded and emits a startup heartbeat while work is active', () => {
    const devWindows = readFileSync(
      resolve(root, 'scripts', 'dev-windows.js'),
      'utf8',
    );

    expect(devWindows).toContain('构建超过 ${Math.round(timeoutMs / 1000)} 秒无结果');
    expect(devWindows).toContain('waitForExit(build, \'后端\')');
    expect(devWindows).toContain('waitForExit(build, \'客户端\')');
    expect(devWindows).toContain('progressHeartbeat = setInterval');
    expect(devWindows).toContain('构建仍在进行，请耐心等待');
  });
});
