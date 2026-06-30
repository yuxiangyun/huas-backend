/**
 * [INPUT]: 依赖 calendar-signature 的生成与校验能力
 * [OUTPUT]: 对外提供 generateCalendarToken()/verifyCalendarToken() 兼容别名，并再导出 signature API
 * [POS]: auth 的日历 token 兼容层，不承载第二套签名实现
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import {
  generateCalendarSignature,
  verifyCalendarSignature,
} from './calendar-signature';

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
