import { API_BASE_URL } from '@/shared/config/env';

export function buildMediaUrl(url: string) {
  if (!url) return '';
  if (
    url.startsWith('http://')
    || url.startsWith('https://')
    || url.startsWith('blob:')
    || url.startsWith('data:')
  ) {
    return url;
  }
  return `${API_BASE_URL}${url}`;
}
