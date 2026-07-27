/**
 * [INPUT]: 依赖 modules/calendar/infrastructure 的 canonical HMAC 生成与校验能力
 * [OUTPUT]: 对外提供 generateCalendarToken()/verifyCalendarToken() 兼容别名，并再导出 signature API
 * [POS]: auth 的日历 token 兼容 Facade，旧 token 命名委托 Calendar canonical 签名
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import {
  generateCalendarSignature,
  verifyCalendarSignature,
} from '../modules/calendar/infrastructure/hmac-calendar-signature';

export {
  generateCalendarSignature,
  verifyCalendarSignature,
};

export function generateCalendarToken(studentId: string): string {
  return generateCalendarSignature(studentId);
}

export function verifyCalendarToken(studentId: string, token: string): boolean {
  return verifyCalendarSignature(studentId, token);
}
