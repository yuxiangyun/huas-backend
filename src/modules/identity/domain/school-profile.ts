/**
 * [INPUT]: 学校姓名、班级的已验证字符串或本地可空字段
 * [OUTPUT]: 对外提供学校姓名归一与资料完整性判断，识别历史解析器合成的精确姓名占位
 * [POS]: identity/domain 的学校资料事实规则；无协议、存储或用例实现依赖
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export const LEGACY_SCHOOL_NAME_PLACEHOLDER = '未知姓名';

export function normalizeSchoolProfileName(value: string | null | undefined): string {
  const name = value?.trim() || '';
  return name === LEGACY_SCHOOL_NAME_PLACEHOLDER ? '' : name;
}

export function hasCompleteSchoolProfile(profile: {
  name: string | null | undefined;
  className: string | null | undefined;
}): boolean {
  return Boolean(normalizeSchoolProfileName(profile.name) && profile.className?.trim());
}
