import { existsSync } from 'node:fs';
import { delimiter, dirname, join } from 'node:path';

export interface CliInvocation {
  args: string[];
  command: string;
}

const windowsCliCache = new Map<string, CliInvocation>();
const BUNDLED_LARK_CLI_ENTRYPOINT = [
  'node_modules',
  '@larksuite',
  'cli',
  'scripts',
  'run.js',
];
const BUNDLED_LARK_CLI_BINARY = [
  'node_modules',
  '@larksuite',
  'cli',
  'bin',
  process.platform === 'win32' ? 'lark-cli.exe' : 'lark-cli',
];
const PROXY_ENV_NAMES = [
  'ALL_PROXY',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'all_proxy',
  'http_proxy',
  'https_proxy',
] as const;

/**
 * Keep connector CLIs usable when the parent process inherited a known-dead
 * loopback proxy. Other proxy values remain untouched for managed networks.
 */
export function getCliEnvironment(): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = { ...process.env };
  for (const name of PROXY_ENV_NAMES) {
    if (hasKnownDeadLoopbackProxy(environment)) delete environment[name];
  }
  return environment;
}

export function hasKnownDeadLoopbackProxy(
  environment: NodeJS.ProcessEnv = process.env,
): boolean {
  return PROXY_ENV_NAMES.some((name) =>
    isKnownDeadLoopbackProxy(environment[name]),
  );
}

/** Resolve npm-style Windows CLI shims to their Node entrypoints. */
export function resolveCliInvocation(
  command: string,
  args: string[],
): CliInvocation {
  const baseName = command.replace(/\.cmd$/iu, '').toLowerCase();
  const bundledInvocation = resolveBundledLarkCliInvocation(baseName, args);
  if (bundledInvocation) return bundledInvocation;

  if (process.platform !== 'win32') {
    return { args, command };
  }

  if (baseName !== 'lark-cli' && baseName !== 'dws') {
    return { args, command };
  }

  const cached = windowsCliCache.get(baseName);
  if (cached) return { ...cached, args: [...cached.args, ...args] };

  const shimPath = findWindowsShim(`${baseName}.cmd`);
  if (!shimPath) return { args, command };

  const binDirectory = dirname(shimPath);
  const nodePath = join(binDirectory, 'node.exe');
  const entrypoint =
    baseName === 'lark-cli'
      ? join(binDirectory, 'node_modules', '@larksuite', 'cli', 'scripts', 'run.js')
      : join(binDirectory, 'node_modules', 'dingtalk-workspace-cli', 'bin', 'dws.js');
  if (!existsSync(nodePath) || !existsSync(entrypoint)) {
    return { args, command };
  }

  const invocation: CliInvocation = {
    args: [entrypoint],
    command: nodePath,
  };
  windowsCliCache.set(baseName, invocation);
  return { ...invocation, args: [...invocation.args, ...args] };
}

export function hasBundledLarkCli(appRoot = process.cwd()): boolean {
  return (
    existsSync(join(appRoot, ...BUNDLED_LARK_CLI_ENTRYPOINT)) &&
    existsSync(join(appRoot, ...BUNDLED_LARK_CLI_BINARY))
  );
}

function resolveBundledLarkCliInvocation(
  baseName: string,
  args: string[],
): CliInvocation | null {
  if (baseName !== 'lark-cli' || !hasBundledLarkCli()) return null;
  return {
    args: [join(process.cwd(), ...BUNDLED_LARK_CLI_ENTRYPOINT), ...args],
    command: process.execPath,
  };
}

function findWindowsShim(name: string): string | null {
  const pathEntries = (process.env.PATH || '').split(delimiter).filter(Boolean);
  for (const entry of pathEntries) {
    const candidate = join(entry, name);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

function isKnownDeadLoopbackProxy(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const parsed = new URL(value.includes('://') ? value : `http://${value}`);
    return (
      (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost') &&
      parsed.port === '9'
    );
  } catch {
    return false;
  }
}
