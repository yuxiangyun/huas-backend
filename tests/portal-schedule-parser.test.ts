import { describe, expect, it } from 'bun:test';
import { ECardParser } from '../src/parsers/portal/ecard-parser';
import { PortalScheduleParser } from '../src/parsers/portal/portal-schedule-parser';
import { UserParser } from '../src/parsers/portal/user-parser';

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

describe('Portal code 语义', () => {
  const expiredCodes = [401, '401', 403, '403', -1, '-1'];

  for (const code of expiredCodes) {
    it(`一卡通 code=${String(code)} 归一为 SESSION_EXPIRED`, () => {
      expect(() => ECardParser.parse({
        code,
        message: 'token 已过期',
      })).toThrow('SESSION_EXPIRED');
    });

    it(`用户资料 code=${String(code)} 归一为 SESSION_EXPIRED`, () => {
      expect(() => UserParser.parse({
        code,
        message: 'token 已过期',
      })).toThrow('SESSION_EXPIRED');
    });
  }

  it('用户资料 code=0 的数字和字符串都保持正常解析', () => {
    const payload = {
      data: {
        username: '2023001777',
        attributes: {
          userName: '李四',
          organizationName: '机自25102班',
          identityTypeName: '学生',
          organizationCode: 'mock-org',
        },
      },
    };

    expect(UserParser.parse({ ...payload, code: 0 })?.name).toBe('李四');
    expect(UserParser.parse({ ...payload, code: '0' })?.className).toBe('机自25102班');
  });
});
