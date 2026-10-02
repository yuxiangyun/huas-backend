/**
 * [INPUT]: 依赖未知 Portal 用户 JSON、IUserInfo、学校资料姓名规则与 portal-code 的明确 code 判断
 * [OUTPUT]: 对外提供 UserParser，验证结构及字符串字段，缺失资料留空，仅明确过期 code 归一为 SESSION_EXPIRED
 * [POS]: campus-integrations/portal/parsers 的纯协议解析器，不合成本地学校事实，不透传未知 message 作为错误分类
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import type { IUserInfo } from '../../../../types';
import { isPortalSessionExpiredCode, isPortalSuccessCode } from './portal-code';
import { normalizeSchoolProfileName } from '../../../identity/domain/school-profile';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function optionalString(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') throw new Error('USER_DATA_INVALID');
  return value.trim();
}

export const UserParser = {
  parse(json: unknown): IUserInfo {
    const payload = asRecord(json);
    if (!payload) throw new Error('USER_DATA_INVALID');
    if (!isPortalSuccessCode(payload.code)) {
      if (isPortalSessionExpiredCode(payload.code)) {
        throw new Error('SESSION_EXPIRED');
      }
      throw new Error('USER_UPSTREAM_ERROR');
    }
    const data = asRecord(payload.data);
    if (!data) throw new Error('USER_DATA_INVALID');
    const studentId = optionalString(data.username);
    if (!studentId) throw new Error('USER_DATA_INVALID');
    const attrs = data.attributes === undefined || data.attributes === null
      ? {}
      : asRecord(data.attributes);
    if (!attrs) throw new Error('USER_DATA_INVALID');
    return {
      name: normalizeSchoolProfileName(optionalString(attrs.userName)),
      studentId,
      className: optionalString(attrs.organizationName),
      identity: optionalString(attrs.identityTypeName) || '学生',
      organizationCode: optionalString(attrs.organizationCode),
    };
  }
};
