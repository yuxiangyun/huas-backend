/**
 * [INPUT]: 依赖 Portal 课表、一卡通、用户资料解析器与共享 code 语义
 * [OUTPUT]: 验证数字/字符串成功码、过期码与稳定解析结果
 * [POS]: tests 的 Portal code 契约回归套件，保护各解析器状态码语义一致
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { describe, expect, it } from 'bun:test';
import { ECardParser } from '../src/parsers/portal/ecard-parser';
import { PortalScheduleParser } from '../src/parsers/portal/portal-schedule-parser';
import { UserParser } from '../src/parsers/portal/user-parser';

describe('PortalScheduleParser', () => {
  for (const code of [0, '0']) {
    it(`code=${String(code)} 且没有 schedule 时返回空课表，而不是抛错`, () => {
      const result = PortalScheduleParser.parse({
        code,
        message: '没有相关数据',
        data: {},
      }, '2025-02-03');

      expect(result).toEqual({
        week: '2025-02-03',
        courses: [],
        message: '没有相关数据',
      });
    });
  }

  for (const code of [401, '401', 403, '403', -1, '-1']) {
    it(`门户过期 code=${String(code)} 归一为 SESSION_EXPIRED`, () => {
      expect(() => PortalScheduleParser.parse({
        code,
        message: '凭证不可用',
      }, '2025-02-03')).toThrow('SESSION_EXPIRED');
    });
  }

  it('只保留请求日期范围内课程，默认范围为 startDate 所在七天', () => {
    const result = PortalScheduleParser.parse({
      code: 0,
      data: {
        schedule: {
          '2025-02-03': { calendarList: [{ title: '本周课程', address: 'A101', remark: '节次:1-2节' }] },
          '2025-02-10': { calendarList: [{ title: '下周课程', address: 'A102', remark: '节次:1-2节' }] },
        },
      },
    }, '2025-02-03');

    expect(result.courses.map((course) => course.name)).toEqual(['本周课程']);
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

  it('一卡通明确 0 元可解析，余额字段缺失被拒绝', () => {
    expect(ECardParser.parse({ code: 0, data: { cardWallet: 0 } })?.balance).toBe(0);
    expect(ECardParser.parse({ code: '0', data: { balance: '0' } })?.balance).toBe(0);
    expect(() => ECardParser.parse({ code: 0, data: {} })).toThrow('一卡通余额字段缺失');
  });

  it('非会话型 Portal 错误必须抛出，不能以 null 绕过 stale fallback', () => {
    expect(() => ECardParser.parse({ code: 500, message: '系统维护' })).toThrow('ECARD_UPSTREAM_ERROR');
    expect(() => UserParser.parse({ code: 500, message: '系统维护' })).toThrow('USER_UPSTREAM_ERROR');
    expect(() => UserParser.parse({ code: 0 })).toThrow('USER_DATA_INVALID');
  });
});
