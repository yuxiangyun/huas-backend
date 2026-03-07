import type { IUserInfo } from '../types';

export const UserParser = {
  parse(json: any): IUserInfo | null {
    if (!json) throw new Error('SESSION_EXPIRED');
    if (json.code !== 0) {
      if (json.code === 401 || json.code === 403 || json.code === -1) {
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
