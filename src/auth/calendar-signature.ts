/**
 * [INPUT]: 依赖 node:crypto HMAC/timingSafeEqual 与 config.calendar.secret
 * [OUTPUT]: 对外提供 generateCalendarSignature() 与 verifyCalendarSignature()
 * [POS]: auth 的日历订阅签名核心，被 calendar 路由和 calendar-token 兼容层消费
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '../config';

function normalizeStudentId(studentId: string): string {
  return (studentId || '').trim();
}

export function generateCalendarSignature(studentId: string): string {
  const normalizedStudentId = normalizeStudentId(studentId);
  return createHmac('sha256', config.calendar.secret)
    .update(normalizedStudentId)
    .digest('hex');
}

export function verifyCalendarSignature(studentId: string, signature: string): boolean {
  const normalizedStudentId = normalizeStudentId(studentId);
  const normalizedSignature = (signature || '').trim().toLowerCase();
  if (!normalizedStudentId || !normalizedSignature) return false;

  const expected = Buffer.from(generateCalendarSignature(normalizedStudentId), 'utf8');
  const actual = Buffer.from(normalizedSignature, 'utf8');
  if (expected.length !== actual.length) return false;

  return timingSafeEqual(expected, actual);
}
