interface PromptVersionIdentity {
  id: string;
  publishedAt?: string;
  versionNumber?: number;
}

export function orderPromptVersions<T extends PromptVersionIdentity>(
  activeVersionId: string | undefined,
  versions: readonly T[],
): T[] {
  return [...versions].sort((left: T, right: T): number => {
    if (left.id === activeVersionId) return -1;
    if (right.id === activeVersionId) return 1;
    const leftTime = left.publishedAt ? Date.parse(left.publishedAt) : 0;
    const rightTime = right.publishedAt ? Date.parse(right.publishedAt) : 0;
    if (leftTime !== rightTime) return rightTime - leftTime;
    return (right.versionNumber ?? 0) - (left.versionNumber ?? 0);
  });
}
