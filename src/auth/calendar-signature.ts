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
