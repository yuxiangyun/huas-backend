const rawApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim() || '';

export const APP_NAME = 'HUAS Web';
export const APP_BASENAME = '/m';
export const API_BASE_URL = rawApiBaseUrl.endsWith('/')
  ? rawApiBaseUrl.slice(0, -1)
  : rawApiBaseUrl;

export function buildAppPath(path: string) {
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return normalized === '/' ? `${APP_BASENAME}/` : `${APP_BASENAME}${normalized}`;
}
