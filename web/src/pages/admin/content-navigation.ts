import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

export const CONTENT_PAGE_SIZE = 20;
const MAX_PAGE = Math.floor(Number.MAX_SAFE_INTEGER / CONTENT_PAGE_SIZE);

function positiveParameter(value: string | null, fallback: number, maximum = Number.MAX_SAFE_INTEGER) {
  if (!value || !/^\d+$/.test(value)) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= maximum ? parsed : fallback;
}

export function useContentNavigation() {
  const [params, setParams] = useSearchParams();
  const update = useCallback((values: Record<string, string | number | null>, replace = false) => {
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      for (const [key, value] of Object.entries(values)) {
        if (value === null || value === '' || ((key === 'page' || key === 'commentsPage') && value === 1)) {
          next.delete(key);
        } else {
          next.set(key, String(value));
        }
      }
      return next;
    }, { replace });
  }, [setParams]);

  return {
    page: positiveParameter(params.get('page'), 1, MAX_PAGE),
    commentsPage: positiveParameter(params.get('commentsPage'), 1, MAX_PAGE),
    postId: positiveParameter(params.get('postId'), 0) || null,
    keyword: params.get('keyword')?.trim() ?? '',
    category: params.get('category') ?? '',
    update,
  };
}

export type ContentNavigation = ReturnType<typeof useContentNavigation>;

export function contentDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
