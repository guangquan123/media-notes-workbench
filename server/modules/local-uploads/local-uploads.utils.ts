interface ByteRange {
  end: number;
  start: number;
}

export function resolveByteRange(
  range: string,
  fileSize: number,
): ByteRange | null {
  const match: RegExpMatchArray | null = /^bytes=(\d*)-(\d*)$/u.exec(range);
  if (!match || fileSize <= 0) return null;
  const start: number = match[1]
    ? Number(match[1])
    : Math.max(0, fileSize - Number(match[2] || 0));
  const requestedEnd: number | null = match[1] && match[2]
    ? Number(match[2])
    : null;
  const end: number = Math.min(requestedEnd ?? fileSize - 1, fileSize - 1);
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    start >= fileSize ||
    end < start
  ) {
    return null;
  }
  return { end, start };
}

export type { ByteRange };
