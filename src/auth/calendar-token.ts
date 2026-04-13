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
