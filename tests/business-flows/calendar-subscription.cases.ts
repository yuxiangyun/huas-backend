/**
 * [INPUT]: 依赖 Calendar 路由、双源课表缓存、签名与 ICS 测试工厂
 * [OUTPUT]: 验证订阅签名、缓存复用、双源 fallback、UID、折行与日期推导
 * [POS]: tests/business-flows 的独立能力用例集，由聚合入口在进程级 mock 隔离内装配
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { describe, expect, it } from 'bun:test';
import {
  Hono,
  eq,
  upstreamState,
  getDb,
  schema,
  registerRoutes,
  PortalScheduleService,
  addDaysInTest,
  unfoldIcs,
  createUser,
} from './harness';

describe('日历订阅', () => {
  it('固定 token 链接可生成并输出本周 ICS', async () => {
    const userId = await createUser('2023001777', 'pass-calendar');
    const app = new Hono();
    registerRoutes(app);
    const { getCurrentWeekRange } = await import('../../src/services/calendar/calendar-subscription-service.ts');
    const currentWeek = getCurrentWeekRange();
    const courseDate = new Date(`${currentWeek.startDate}T00:00:00+08:00`);
    courseDate.setDate(courseDate.getDate() + 1);
    const tuesday = courseDate.toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' });

    upstreamState.upstreamResolver = async (_userId: number, mode: 'jw' | 'portal') => {
      expect(mode).toBe('portal');
      return {
        week: currentWeek.startDate,
        courses: [
          {
            name: '大学英语',
            teacher: '王老师',
            location: '教B201',
            day: 2,
            section: '1-2',
            weekStr: tuesday,
          },
        ],
      };
    };

    const { generateToken } = await import('../../src/auth/jwt.ts');
    const token = await generateToken({ userId, studentId: '2023001777', name: 'name-2023001777' });

    const linkRes = await app.request('http://localhost/api/calendar/link', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(linkRes.status).toBe(200);
    const linkBody = await linkRes.json() as any;
    expect(linkBody.success).toBe(true);
    expect(linkBody.data.url).toContain(`https://calendar.example.test/calendar/schedule.ics?studentId=2023001777&sig=${linkBody.data.sig}`);

    const subscriptionUrl = new URL(linkBody.data.url);
    const icsRes = await app.request(subscriptionUrl.toString());
    expect(icsRes.status).toBe(200);
    expect(icsRes.headers.get('content-type')).toContain('text/calendar');

    const ics = await icsRes.text();
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('SUMMARY:大学英语');
    expect(ics).toContain(`DTSTART;TZID=Asia/Shanghai:${tuesday.replace(/-/g, '')}T080000`);
    expect(ics).toContain(`DTEND;TZID=Asia/Shanghai:${tuesday.replace(/-/g, '')}T094000`);

    const secondLinkRes = await app.request('http://localhost/api/calendar/link', {
      headers: { Authorization: `Bearer ${token}` },
    });
    const secondLinkBody = await secondLinkRes.json() as any;
    expect(secondLinkBody.data.url).toBe(linkBody.data.url);
  });

  it('门户周课表本周缓存已存在时，日历直接复用同一缓存', async () => {
    const userId = await createUser('2023001999', 'pass-calendar-shared-cache');
    const app = new Hono();
    registerRoutes(app);
    const { getCurrentWeekRange } = await import('../../src/services/calendar/calendar-subscription-service.ts');
    const currentWeek = getCurrentWeekRange();

    upstreamState.upstreamCallCount = 0;
    upstreamState.upstreamResolver = async () => ({
      week: '第7周',
      courses: [
        {
          name: '线性代数',
          teacher: '陈老师',
          location: '教C301',
          day: 3,
          section: '3-4',
          weekStr: '星期三(3,4小节)',
        },
      ],
      message: '',
    });

    const portalSchedule = await PortalScheduleService.getSchedule(
      userId,
      '2023001999',
      currentWeek.startDate,
      currentWeek.endDate,
      true,
      'name-2023001999'
    );
    expect(portalSchedule._meta.cached).toBe(false);
    expect(upstreamState.upstreamCallCount).toBe(1);

    const { generateToken } = await import('../../src/auth/jwt.ts');
    const authToken = await generateToken({ userId, studentId: '2023001999', name: 'name-2023001999' });
    const linkRes = await app.request('http://localhost/api/calendar/link', {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const linkBody = await linkRes.json() as any;
    const subscriptionUrl = new URL(linkBody.data.url);

    const icsRes = await app.request(subscriptionUrl.toString());
    expect(icsRes.status).toBe(200);
    expect(upstreamState.upstreamCallCount).toBe(1);

    const ics = await icsRes.text();
    expect(ics).toContain('SUMMARY:线性代数');
    expect(ics).toContain(`DTSTART;TZID=Asia/Shanghai:${addDaysInTest(currentWeek.startDate, 2).replace(/-/g, '')}T100000`);

    const cacheKey = `portal-schedule:2023001999:${currentWeek.startDate}:${currentWeek.endDate}`;
    await getDb().update(schema.cache)
      .set({ updatedAt: new Date(Date.now() - 16 * 60 * 1000) })
      .where(eq(schema.cache.key, cacheKey));
    const refreshed = await app.request(subscriptionUrl.toString());
    expect(refreshed.status).toBe(200);
    expect(upstreamState.upstreamCallCount).toBe(2);
  });

  it('Portal 首读失败时日历按统一门面回退 JW 周课表', async () => {
    const userId = await createUser('2023001998', 'pass-calendar-fallback');
    const app = new Hono();
    registerRoutes(app);
    const requestedModes: string[] = [];
    upstreamState.upstreamResolver = async (_userId: number, mode: 'jw' | 'portal') => {
      requestedModes.push(mode);
      if (mode === 'portal') throw new Error('REQUEST_TIMEOUT');
      return {
        week: '第7周',
        courses: [{ name: 'JW容灾课程', day: 1, section: '1-2', teacher: '', location: '', weekStr: '' }],
      };
    };
    const { generateToken } = await import('../../src/auth/jwt.ts');
    const token = await generateToken({ userId, studentId: '2023001998' });
    const link = await app.request('http://localhost/api/calendar/link', { headers: { Authorization: `Bearer ${token}` } });
    const body = await link.json() as any;

    const response = await app.request(body.data.url);
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('SUMMARY:JW容灾课程');
    expect(requestedModes).toEqual(['portal', 'jw']);
  });

  it('订阅链接使用 studentId + HMAC 签名，且与业务 JWT 无关', async () => {
    const { generateCalendarSignature } = await import('../../src/auth/calendar-signature.ts');
    expect(generateCalendarSignature('2023001001')).toBe(generateCalendarSignature('2023001001'));
    expect(generateCalendarSignature('2023001001')).not.toBe(generateCalendarSignature('2023001002'));
  });

  it('本周缓存未命中时仅回源一次，后续订阅请求命中缓存', async () => {
    const userId = await createUser('2023001888', 'pass-calendar-cache');
    const app = new Hono();
    registerRoutes(app);
    const { getCurrentWeekRange } = await import('../../src/services/calendar/calendar-subscription-service.ts');
    const currentWeek = getCurrentWeekRange();

    const { generateToken } = await import('../../src/auth/jwt.ts');
    const authToken = await generateToken({ userId, studentId: '2023001888', name: 'name-2023001888' });

    const requestedModes: Array<'jw' | 'portal'> = [];
    upstreamState.upstreamCallCount = 0;
    upstreamState.upstreamResolver = async (_userId: number, mode: 'jw' | 'portal') => {
      requestedModes.push(mode);
      return {
        week: currentWeek.startDate,
        courses: [
          {
            name: '高等数学',
            teacher: '李老师',
            location: '教A101',
            day: 1,
            section: '3-4',
            weekStr: currentWeek.startDate,
          },
        ],
      };
    };

    const linkRes = await app.request('http://localhost/api/calendar/link', {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    const linkBody = await linkRes.json() as any;
    const subscriptionUrl = new URL(linkBody.data.url);

    const first = await app.request(subscriptionUrl.toString());
    expect(first.status).toBe(200);
    expect(upstreamState.upstreamCallCount).toBe(1);

    const second = await app.request(subscriptionUrl.toString());
    expect(second.status).toBe(200);
    expect(upstreamState.upstreamCallCount).toBe(1);
    expect(requestedModes).toEqual(['portal']);
  });

  it('同名同节次但不同地点的课程会生成不同 UID', async () => {
    const { buildWeeklyScheduleIcs, getCurrentWeekRange } = await import('../../src/services/calendar/calendar-subscription-service.ts');
    const currentWeek = getCurrentWeekRange();
    const ics = buildWeeklyScheduleIcs({
      studentId: '2023001222',
      weekStart: currentWeek.startDate,
      courses: [
        {
          name: '大学英语',
          teacher: '王老师',
          location: '教B201',
          day: 2,
          section: '1-2',
          weekStr: addDaysInTest(currentWeek.startDate, 1),
        },
        {
          name: '大学英语',
          teacher: '王老师',
          location: '教B202',
          day: 2,
          section: '1-2',
          weekStr: addDaysInTest(currentWeek.startDate, 1),
        },
      ],
    });

    const uids = ics.split('\r\n')
      .filter((line) => line.startsWith('UID:'));

    expect(uids.length).toBe(2);
    expect(new Set(uids).size).toBe(2);
  });

  it('中文长文本按 UTF-8 75-octet 上限折行且可无损还原', async () => {
    const { buildWeeklyScheduleIcs } = await import('../../src/services/calendar/calendar-subscription-service.ts');
    const longName = '高等数学与线性代数'.repeat(12);
    const ics = buildWeeklyScheduleIcs({
      studentId: '2023001444',
      weekStart: '2026-04-13',
      generatedAt: new Date('2026-04-13T00:00:00Z'),
      courses: [{
        name: longName,
        teacher: '张老师',
        location: '逸夫楼智慧教室'.repeat(10),
        day: 1,
        section: '1-2',
        weekStr: '2026-04-13',
      }],
    });
    const physicalLines = ics.split('\r\n').filter(Boolean);

    for (const line of physicalLines) {
      expect(new TextEncoder().encode(line).byteLength).toBeLessThanOrEqual(75);
    }

    expect(unfoldIcs(ics)).toContain(`SUMMARY:${longName}`);
    expect(ics).not.toContain('\uFFFD');
  });

  it('课程缺少明确日期时，会根据本周起始日和 day 推导事件日期', async () => {
    const { buildWeeklyScheduleIcs, getCurrentWeekRange } = await import('../../src/services/calendar/calendar-subscription-service.ts');
    const currentWeek = getCurrentWeekRange(new Date('2026-04-13T08:00:00+08:00'));
    const expectedDate = addDaysInTest(currentWeek.startDate, 4);

    const ics = buildWeeklyScheduleIcs({
      studentId: '2023001333',
      weekStart: currentWeek.startDate,
      courses: [
        {
          name: '大学物理',
          teacher: '周老师',
          location: '教A201',
          day: 5,
          section: '5-6',
          weekStr: '星期五(5,6小节)',
        },
      ],
    });

    expect(ics).toContain(`DTSTART;TZID=Asia/Shanghai:${expectedDate.replace(/-/g, '')}T143000`);
    expect(ics).toContain(`DTEND;TZID=Asia/Shanghai:${expectedDate.replace(/-/g, '')}T161000`);
    expect(unfoldIcs(ics)).toContain(`DESCRIPTION:教师: 周老师\\n地点: 教A201\\n节次: 5-6\\n日期: ${expectedDate}`);
  });
});
