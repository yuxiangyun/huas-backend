/**
 * [INPUT]: 依赖 node:crypto HMAC/timingSafeEqual 与注入的 Calendar 密钥
 * [OUTPUT]: 对外提供 HmacCalendarSignature 及默认 generate/verifyCalendarSignature 签名 API
 * [POS]: calendar/infrastructure 的 HMAC 适配器，是 studentId 绑定签名的 canonical 唯一实现
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '../../../config';
import type { CalendarSignaturePort } from '../application/calendar.ports';

function normalizeStudentId(studentId: string): string {
  return (studentId || '').trim();
}

export class HmacCalendarSignature implements CalendarSignaturePort {
  constructor(private readonly secret: string) {}

  generate(studentId: string): string {
    return createHmac('sha256', this.secret)
      .update(normalizeStudentId(studentId))
      .digest('hex');
  }

  verify(studentId: string, signature: string): boolean {
    const normalizedStudentId = normalizeStudentId(studentId);
    const normalizedSignature = (signature || '').trim().toLowerCase();
    if (!normalizedStudentId || !normalizedSignature) return false;

    const expected = Buffer.from(this.generate(normalizedStudentId), 'utf8');
    const actual = Buffer.from(normalizedSignature, 'utf8');
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }
}

const defaultCalendarSignature = new HmacCalendarSignature(config.calendar.secret);

export function generateCalendarSignature(studentId: string): string {
  return defaultCalendarSignature.generate(studentId);
}

export function verifyCalendarSignature(studentId: string, signature: string): boolean {
  return defaultCalendarSignature.verify(studentId, signature);
}
