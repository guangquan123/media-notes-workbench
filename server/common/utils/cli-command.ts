import { existsSync } from 'node:fs';
import { delimiter, dirname, join } from 'node:path';

export interface CliInvocation {
  args: string[];
  command: string;
}

const windowsCliCache = new Map<string, CliInvocation>();

/** Resolve npm-style Windows CLI shims to their Node entrypoints. */
export function resolveCliInvocation(
  command: string,
  args: string[],
): CliInvocation {
  if (process.platform !== 'win32') {
    return { args, command };
  }

  const baseName = command.replace(/\.cmd$/iu, '').toLowerCase();
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

function findWindowsShim(name: string): string | null {
  const pathEntries = (process.env.PATH || '').split(delimiter).filter(Boolean);
  for (const entry of pathEntries) {
    const candidate = join(entry, name);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}
