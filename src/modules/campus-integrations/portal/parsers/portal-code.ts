/**
 * [INPUT]: 依赖 Portal 上游 JSON code 字段的数字与字符串形态
 * [OUTPUT]: 对外提供 isPortalSuccessCode 与 isPortalSessionExpiredCode
 * [POS]: campus-integrations/portal/parsers 的 code 语义收口点，被三类 Portal 解析器复用，仅接受明确数字或字符串，不强制转换数组及对象
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

const SESSION_EXPIRED_CODES = new Set(['401', '403', '-1']);

export function isPortalSuccessCode(code: unknown): boolean {
  return code === 0 || code === '0';
}

export function isPortalSessionExpiredCode(code: unknown): boolean {
  return (typeof code === 'number' || typeof code === 'string')
    && SESSION_EXPIRED_CODES.has(String(code));
}
