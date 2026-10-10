import { createHash, randomBytes } from 'node:crypto';
import type { ScheduleShareTokens } from '../domain/schedule-share';

export class RandomScheduleShareTokens implements ScheduleShareTokens {
  create() { return randomBytes(32).toString('base64url'); }
  hash(token: string) { return createHash('sha256').update(token).digest('hex'); }
}
