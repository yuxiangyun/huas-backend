/**
 * [INPUT]: 依赖 Portal 上游用户 JSON、IUserInfo 类型与 portal-code 的 code 语义判断
 * [OUTPUT]: 对外提供 UserParser，解析学号、姓名、班级、身份与组织编码
 * [POS]: parsers/portal 的用户资料解析器，将 Portal 过期 code 归一为 SESSION_EXPIRED
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import type { IUserInfo } from '../../types';
import { isPortalSessionExpiredCode, isPortalSuccessCode } from './portal-code';

export const UserParser = {
  parse(json: any): IUserInfo | null {
    if (!json) throw new Error('SESSION_EXPIRED');
    if (!isPortalSuccessCode(json.code)) {
      if (isPortalSessionExpiredCode(json.code)) {
        throw new Error('SESSION_EXPIRED');
      }
      return null;
    }
    if (!json.data) return null;
    const attrs = json.data.attributes || {};
    return {
      name: attrs.userName || '未知姓名',
      studentId: json.data.username || '',
      className: attrs.organizationName || '',
      identity: attrs.identityTypeName || '学生',
      organizationCode: attrs.organizationCode || ''
    };
  }
};
