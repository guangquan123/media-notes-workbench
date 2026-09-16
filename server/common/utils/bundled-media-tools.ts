import { existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import { getLocalRuntimePaths } from './local-runtime-paths';

const BUNDLED_MEDIA_TOOL_FILENAMES = new Map<string, string>([
  ['ffmpeg', 'ffmpeg.exe'],
  ['ffprobe', 'ffprobe.exe'],
  ['yt-dlp', 'yt-dlp.exe'],
]);

const LOCAL_WHISPER_CLI_FILENAME =
  process.platform === 'win32' ? 'whisper-cli.exe' : 'whisper-cli';

function getMediaToolName(command: string): string {
  return basename(command).replace(/\.exe$/iu, '').toLowerCase();
}

/**
 * Prefer the verified media executable shipped beside the application. This
 * keeps the installed app usable even when a launcher does not propagate PATH.
 */
export function getBundledMediaToolPath(
  command: string,
  appRoot: string = getLocalRuntimePaths().appRoot,
): string | undefined {
  if (getMediaToolName(command) === 'whisper-cli') {
    const localPath: string = join(
      getLocalRuntimePaths().dataDir,
      'tools',
      LOCAL_WHISPER_CLI_FILENAME,
    );
    return existsSync(localPath) ? localPath : undefined;
  }
  const fileName: string | undefined = BUNDLED_MEDIA_TOOL_FILENAMES.get(
    getMediaToolName(command),
  );
  if (!fileName) return undefined;

  const toolPath: string = join(appRoot, 'tools', fileName);
  return existsSync(toolPath) ? toolPath : undefined;
}

export function resolveMediaToolCommand(
  command: string,
  appRoot?: string,
): string {
  return getBundledMediaToolPath(command, appRoot) || command;
}
