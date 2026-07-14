const KILOBYTE = 1024;
const MEGABYTE = KILOBYTE * 1024;
const GIGABYTE = MEGABYTE * 1024;

export function formatFileSize(bytes: number): string {
  if (bytes < MEGABYTE) return `${Math.ceil(bytes / KILOBYTE)} KB`;
  if (bytes < GIGABYTE) return `${(bytes / MEGABYTE).toFixed(1)} MB`;
  return `${(bytes / GIGABYTE).toFixed(1)} GB`;
}
