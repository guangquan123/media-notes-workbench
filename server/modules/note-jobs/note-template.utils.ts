export function getNextPromptVersionNumber(
  latestVersionNumber: number | null,
): number {
  return latestVersionNumber === null ? 1 : latestVersionNumber + 1;
}
