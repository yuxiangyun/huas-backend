/**
 * [INPUT]: 依赖校园班级原始文本与可选社区昵称
 * [OUTPUT]: 对外提供专业提取、脱敏同学标签与昵称优先的社区作者显示名
 * [POS]: shared/lib 的校园身份展示规则，统一 Discover 作者回退而不泄露完整班级
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

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

export function buildCommunityAuthorLabel(
  nickname: string | null | undefined,
  classLabel: string | null | undefined,
) {
  return nickname?.trim() || buildClassmateLabel(classLabel);
}
