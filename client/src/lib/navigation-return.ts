export interface NavigationLocationLike {
  hash: string;
  pathname: string;
  search: string;
}

function isSafeInternalPath(value: string): boolean {
  return value.startsWith('/') && !value.startsWith('//');
}

export function getSafeReturnTo(
  value: string | null | undefined,
  fallback: string = '/',
): string {
  if (!value || !isSafeInternalPath(value)) return fallback;
  return value;
}

export function hasSafeReturnTo(value: string | null | undefined): boolean {
  return Boolean(value && isSafeInternalPath(value));
}

export function buildReturnTo(location: NavigationLocationLike): string {
  return `${location.pathname}${location.search}${location.hash}`;
}
