interface PromptVersionIdentity {
  id: string;
}

export function orderPromptVersions<T extends PromptVersionIdentity>(
  activeVersionId: string | undefined,
  versions: readonly T[],
): T[] {
  return [...versions].sort((left: T, right: T): number => {
    if (left.id === activeVersionId) return -1;
    if (right.id === activeVersionId) return 1;
    return 0;
  });
}
