function stripClassMeta(raw: string) {
  return raw
    .replace(/(?:19|20)\d{2}级/g, '')
    .replace(/\d{2,4}班/g, '')
    .replace(/\d{2,4}/g, ' ')
    .replace(/[()（）]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractMajorName(raw: string | null | undefined) {
  const value = (raw || '').trim();
  if (!value) return '';

  if (value.endsWith('同学')) {
    return value.slice(0, -2).trim();
  }

  return stripClassMeta(value);
}

export function buildClassmateLabel(
  raw: string | null | undefined,
  fallback = '校园同学'
) {
  const value = (raw || '').trim();
  if (!value) return fallback;

  if (value.endsWith('同学')) {
    return value;
  }

  const majorName = extractMajorName(value);
  if (!majorName) return fallback;

  const shortMajor = Array.from(majorName).slice(0, 2).join('');
  return shortMajor ? `${shortMajor}同学` : fallback;
}
