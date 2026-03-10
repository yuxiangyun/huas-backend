export const DISCOVER_CATEGORIES = ['1食堂', '2食堂', '3食堂', '5食堂', '校外', '其他'] as const;
export const DISCOVER_COMMON_TAGS = ['好吃', '便宜', '分量足', '辣', '清淡', '排队久', '值得再吃'] as const;

export type DiscoverCategory = typeof DISCOVER_CATEGORIES[number];

export interface DiscoverStoredImage {
  url: string;
  width: number;
  height: number;
  sizeBytes: number;
  mimeType: string;
}

export function isDiscoverCategory(value: string): value is DiscoverCategory {
  return DISCOVER_CATEGORIES.includes(value as DiscoverCategory);
}

export function buildDiscoverAuthorLabel(className: string | null | undefined): string {
  const raw = (className || '').trim();
  if (!raw) return '校园用户';

  const collapsed = raw.replace(/\s+/g, ' ');
  const stripped = collapsed
    .replace(/(?:19|20)\d{2}级/g, '')
    .replace(/\d{2,4}班/g, '')
    .replace(/\d{2,4}/g, ' ')
    .replace(/[()（）]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!stripped) return '校园用户';
  return stripped;
}

export function parseStringArray(value: string): string[] {
  const raw = value.trim();
  if (!raw) return [];

  if (raw.startsWith('[')) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed
          .map((item) => String(item ?? '').trim())
          .filter(Boolean);
      }
    } catch {
      // Fall through to delimiter-based parsing.
    }
  }

  return raw
    .split(/[\n,，]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function safeParseJsonArray<T>(value: string, fallback: T[]): T[] {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed as T[] : fallback;
  } catch {
    return fallback;
  }
}
