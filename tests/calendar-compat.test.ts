/**
 * [INPUT]: 依赖 Bun Test、Calendar canonical 公开 API 与 routes/services/auth 旧导出路径
 * [OUTPUT]: 提供 Calendar 迁移后 Facade 引用一致性、token 别名与 HMAC 兼容回归证明
 * [POS]: tests 的 Calendar 架构兼容契约，阻止旧路径演化出第二套实现
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { describe, expect, it } from 'bun:test';
import canonicalApiRoutes from '../src/modules/calendar/http/calendar-api.routes';
import canonicalPublicRoutes from '../src/modules/calendar/http/calendar-public.routes';
import {
  buildWeeklyScheduleIcs as canonicalBuildWeeklyScheduleIcs,
  getCurrentWeekRange as canonicalGetCurrentWeekRange,
  getCurrentWeekSchedule as canonicalGetCurrentWeekSchedule,
  resolveCalendarSubscriptionUser as canonicalResolveCalendarSubscriptionUser,
} from '../src/modules/calendar/calendar';
import {
  generateCalendarSignature as canonicalGenerateCalendarSignature,
  verifyCalendarSignature as canonicalVerifyCalendarSignature,
} from '../src/modules/calendar/infrastructure/hmac-calendar-signature';
import { createCalendarApplication } from '../src/modules/calendar/infrastructure/calendar-composition';
import legacyApiRoutes from '../src/routes/calendar/calendar-api.routes';
import legacyPublicRoutes from '../src/routes/calendar/calendar-public.routes';
import {
  buildWeeklyScheduleIcs as legacyBuildWeeklyScheduleIcs,
  getCurrentWeekRange as legacyGetCurrentWeekRange,
  getCurrentWeekSchedule as legacyGetCurrentWeekSchedule,
  resolveCalendarSubscriptionUser as legacyResolveCalendarSubscriptionUser,
} from '../src/services/calendar/calendar-subscription-service';
import {
  generateCalendarSignature as legacyGenerateCalendarSignature,
  verifyCalendarSignature as legacyVerifyCalendarSignature,
} from '../src/auth/calendar-signature';
import {
  generateCalendarToken,
  verifyCalendarToken,
} from '../src/auth/calendar-token';

describe('Calendar 兼容 Facade', () => {
  it('旧 routes/services/auth 导出指向 canonical 运行时实现', () => {
    expect(legacyApiRoutes).toBe(canonicalApiRoutes);
    expect(legacyPublicRoutes).toBe(canonicalPublicRoutes);
    expect(legacyBuildWeeklyScheduleIcs).toBe(canonicalBuildWeeklyScheduleIcs);
    expect(legacyGetCurrentWeekRange).toBe(canonicalGetCurrentWeekRange);
    expect(legacyGetCurrentWeekSchedule).toBe(canonicalGetCurrentWeekSchedule);
    expect(legacyResolveCalendarSubscriptionUser).toBe(canonicalResolveCalendarSubscriptionUser);
    expect(legacyGenerateCalendarSignature).toBe(canonicalGenerateCalendarSignature);
    expect(legacyVerifyCalendarSignature).toBe(canonicalVerifyCalendarSignature);
  });

  it('旧 token 别名保持 studentId HMAC 生成与校验语义', () => {
    const studentId = ' 2023001001 ';
    const signature = canonicalGenerateCalendarSignature(studentId);
    expect(generateCalendarToken(studentId)).toBe(signature);
    expect(verifyCalendarToken(studentId, signature.toUpperCase())).toBe(true);
    expect(verifyCalendarToken('2023001002', signature)).toBe(false);
  });

  it('Academic 显式暂无课表时应用层仍输出空 ICS', async () => {
    const service = createCalendarApplication({
      users: {
        findByStudentId: async (studentId) => ({ id: 1, studentId, name: '测试用户' }),
      },
      signatures: {
        generate: () => 'valid-signature',
        verify: () => true,
      },
      schedules: {
        getMobileJwSchedule: async () => {
          throw new Error('SCHEDULE_NOT_AVAILABLE');
        },
      },
      clock: { now: () => new Date('2026-04-13T08:00:00+08:00') },
      runtimeConfig: { baseUrl: 'https://calendar.example.test', secretConfigured: true },
    });

    const result = await service.resolveSubscription('2023001001', 'valid-signature');
    expect(result.kind).toBe('success');
    if (result.kind !== 'success') throw new Error('expected success');
    expect(result.ics).toContain('BEGIN:VCALENDAR');
    expect(result.ics).not.toContain('BEGIN:VEVENT');
    expect(result.headers['Content-Disposition']).toBe('inline; filename="schedule.ics"');
  });
});
