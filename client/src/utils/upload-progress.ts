export function calculateUploadedBytes(
  completedBytes: number,
  currentPartBytes: number,
  totalBytes: number,
): number {
  return Math.min(completedBytes + currentPartBytes, totalBytes);
}
