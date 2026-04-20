import { describe, expect, it } from 'bun:test';
import { PortalScheduleParser } from '../src/parsers/portal/portal-schedule-parser';

describe('PortalScheduleParser', () => {
  it('code=0 且没有 schedule 时返回空课表，而不是抛错', () => {
    const result = PortalScheduleParser.parse({
      code: 0,
      message: '没有相关数据',
      data: {},
    }, '2025-02-03');

    expect(result).toEqual({
      week: '2025-02-03',
      courses: [],
      message: '没有相关数据',
    });
  });

  it('门户 token 失效时仍抛出 SESSION_EXPIRED', () => {
    expect(() => PortalScheduleParser.parse({
      code: 401,
      message: 'token 已过期',
    }, '2025-02-03')).toThrow('SESSION_EXPIRED');
  });
});
