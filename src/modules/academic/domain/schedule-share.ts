import type { ICourse } from '../../../types';
import type { PreferredScheduleSource } from './schedule-source-policy';
import type { ScheduleFacadeResult } from './schedule';

/** 匿名分享只投影单周学校课表，不包含登录凭据或学校账户标识。 */
export interface SharedSchedule {
  ownerName: string;
  week: string;
  weekStartDate: string;
  weekEndDate: string;
  courses: ICourse[];
  message: string;
  dataUpdatedAt: string | null;
}

export interface ScheduleShareStore {
  insert(tokenHash: string, schedule: SharedSchedule): Promise<void>;
  find(tokenHash: string): Promise<SharedSchedule | null>;
}

export interface ScheduleShareOwnerReader {
  find(userId: number): Promise<{ studentId: string; name: string } | null>;
}

export interface ScheduleShareReader {
  getSchedule(options: {
    userId: number;
    studentId: string;
    date: string;
    name?: string;
    forceRefresh: false;
    preferredSource?: PreferredScheduleSource;
  }): Promise<ScheduleFacadeResult>;
}

export interface ScheduleShareTokens {
  create(): string;
  hash(token: string): string;
}
