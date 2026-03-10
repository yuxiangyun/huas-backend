import { appRoutes } from '@/app/router/paths';
import { APP_BASENAME, buildAppPath } from '@/shared/config/env';

const INTERNAL_ORIGIN = 'https://huas-web.local';
const appBasename: string = APP_BASENAME;

function normalizePathname(pathname: string) {
  if (appBasename !== '/' && pathname === appBasename) {
    return '/';
  }

  if (appBasename !== '/' && pathname.startsWith(`${appBasename}/`)) {
    return pathname.slice(appBasename.length) || '/';
  }

  return pathname;
}

export function normalizeRedirectPath(raw: unknown) {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return null;
  }

  try {
    const url = new URL(raw, INTERNAL_ORIGIN);

    if (url.origin !== INTERNAL_ORIGIN) {
      return null;
    }

    const pathname = normalizePathname(url.pathname);

    if (!pathname.startsWith('/')) {
      return null;
    }

    if (pathname === appRoutes.login) {
      return appRoutes.discover;
    }

    return `${pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}

export function resolveRedirectPath(
  locationLike: { search?: string; state?: unknown },
  fallback = appRoutes.discover
) {
  const fromState = normalizeRedirectPath(
    (locationLike.state as { from?: unknown } | null)?.from
  );

  if (fromState) {
    return fromState;
  }

  const params = new URLSearchParams(locationLike.search || '');
  const fromQuery = normalizeRedirectPath(params.get('from'));

  return fromQuery ?? fallback;
}

export function buildLoginRedirectPath(from: unknown) {
  const normalized = normalizeRedirectPath(from);

  if (!normalized || normalized === appRoutes.login) {
    return buildAppPath(appRoutes.login);
  }

  return buildAppPath(`${appRoutes.login}?from=${encodeURIComponent(normalized)}`);
}
