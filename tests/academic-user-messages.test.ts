/**
 * [INPUT]: 依赖真实 Portal parser、SchoolAccess 归一化、Academic current/stale 编排及隔离 SQLite 缓存
 * [OUTPUT]: 验证无数据提示不写缓存、不覆盖已有课表，且故障和评教未确认结果保留中文原因
 * [POS]: tests 的校园业务用户提示回归，以当前具名端口构造真实解析到响应的数据流，不访问学校网络
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */
import { describe, expect, it, spyOn } from 'bun:test';
import { Hono } from 'hono';
import scheduleRoute from '../src/routes/academic/schedule.routes';
import { ScheduleFacade } from '../src/modules/academic/schedule';
import { onAppError } from '../src/middleware/error.middleware';
import { PortalScheduleApplicationService } from '../src/modules/academic/application/portal-schedule-service';
import { ScheduleFacadeApplicationService } from '../src/modules/academic/application/schedule-facade';
import { EvaluationApplicationService } from '../src/modules/academic/application/evaluation-service';
import type { EvaluationApplicationPorts } from '../src/modules/academic/domain/evaluation';
import { PortalScheduleParser } from '../src/modules/campus-integrations/portal/parsers/portal-schedule-parser';
import { normalizeSchoolFailure } from '../src/modules/campus-integrations/school-access/errors';
import { CacheService } from '../src/modules/cache/cache-service';
import { fallbackOnRefreshFailure } from '../src/services/infra/refresh-fallback';
import { AppError, ErrorCode } from '../src/utils/errors';

const published = { week: '第1周', courses: [{ name: '高等数学', day: 1, section: '1-2', teacher: '教师', location: '教室', weekStr: '' }] };
function scenario(studentId: string) {
  let payload: unknown = { code: 0, message: '没有相关数据', data: {} };
  const portal = new PortalScheduleApplicationService({
    cache: CacheService, refreshFallback: fallbackOnRefreshFailure,
    readJwSchedule: async () => { throw new Error('不应调用'); },
    readPortalSchedule: async (_id, input) => {
      try { return PortalScheduleParser.parse(payload, input.startDate, input.endDate); }
      catch (error) { throw normalizeSchoolFailure(error); }
    },
  });
  const unavailable = {
    getCurrentSchedule: async () => { throw new AppError(ErrorCode.SERVICE_ACCOUNT_UNAVAILABLE, '学校教务系统未能建立查询连接'); },
    getStaleSchedule: async () => null,
  };
  const facade = new ScheduleFacadeApplicationService(unavailable, portal, {
    status: async () => ({ mode: 'mobile-jw-first', updatedAt: 'test', updatedBy: 'test' }),
  }, unavailable);
  return {
    facade,
    query: () => facade.getSchedule({ userId: 1, studentId, date: '2026-09-14', forceRefresh: true }),
    key: `portal-schedule:${studentId}:2026-09-14:2026-09-20`,
    setPayload: (next: unknown) => { payload = next; },
  };
}

describe('学校无数据的用户提示', () => {
  it('真实课表路由返回 200 和初始化提示，不生成错误响应', async () => {
    const studentId = 'message-http-empty';
    const h = scenario(studentId);
    const delegate = spyOn(ScheduleFacade, 'getSchedule').mockImplementation(options => h.facade.getSchedule(options));
    try {
      const app = new Hono();
      app.onError(onAppError);
      app.use('*', async (c, next) => {
        c.set('userId', 991);
        c.set('studentId', studentId);
        await next();
      });
      app.route('/api/schedule', scheduleRoute);
      const response = await app.request('/api/schedule?date=2026-09-14&refresh=true');
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.success).toBe(true);
      expect(body.error_code).toBeUndefined();
      expect(body.data.courses).toEqual([]);
      expect(body.data.message).toContain('可能尚未完成学校账号初始化');
    } finally { delegate.mockRestore(); }
  });

  it('无数据不缓存，初始化后下一次刷新立即取得课程', async () => {
    const h = scenario('message-no-data');
    const empty = await h.query();
    expect(empty.data.courses).toEqual([]);
    expect(empty.data.message).toContain('可能尚未完成学校账号初始化');
    expect(empty.data.message).toContain('返回刷新');
    expect(await CacheService.get(h.key)).toBeNull();
    h.setPayload({ code: 0, data: { schedule: { '2026-09-14': { calendarList: [{ title: '高等数学', remark: '节次:1-2节', address: '教室' }] } } } });
    expect((await h.query()).data.courses[0].name).toBe('高等数学');
    expect(await CacheService.get(h.key)).not.toBeNull();
  });

  it('无数据时优先保留真实旧课表，不能覆盖为空', async () => {
    const h = scenario('message-old-data');
    await CacheService.set(h.key, { ...published, _portalScheduleSchema: 2 }, 0, 'portal');
    const result = await h.query();
    expect(result.data.courses).toEqual(published.courses);
    expect(result._meta.stale).toBe(true);
    expect((await CacheService.get<{ courses: unknown[] }>(h.key))?.data.courses).toEqual(published.courses);
  });

  it('无数据说明不能覆盖明确的认证失效', async () => {
    const h = scenario('message-session-expired');
    h.setPayload({ code: 401, message: '没有相关数据' });
    await expect(h.query()).rejects.toBeInstanceOf(Error);
  });

  it('未知缺载荷不会被当作成功空表', async () => {
    const h = scenario('message-malformed');
    h.setPayload({ code: 0, data: {} });
    await expect(h.query()).rejects.toMatchObject({ code: ErrorCode.SERVICE_ACCOUNT_UNAVAILABLE });
    expect(await CacheService.get(h.key)).toBeNull();
  });
});

const row = {
  index: '1', teacherId: '1', teacherName: '教师', college: '学院', category: '课程', totalScore: '', evaluated: '', submitted: '否',
  pending: true, actionable: true, blocked: false, state: 'pending' as const, editUrl: 'https://xyjw.huas.edu.cn/jsxsd/xspj/xspj_edit.do',
};
function evaluation(options: { prepareFails?: boolean; verifyFails?: boolean }) {
  let reads = 0;
  const ports: EvaluationApplicationPorts = {
    discoverEvaluation: async () => ({ evaluationRequired: true, listUrl: null }),
    readRows: async () => {
      if (++reads > 1 && options.verifyFails) throw new Error('UPSTREAM_PRIVATE_DETAIL');
      return [row];
    },
    evaluateItem: async () => {
      if (options.prepareFails) throw new Error('EVALUATION_UPSTREAM_ERROR_PAGE');
      return { attempted: true, questionCount: 1, fullScore: 100, error: 'SUBMIT_HTTP_500' };
    },
  };
  return new EvaluationApplicationService(ports).submitFullScore(1, 'https://xyjw.huas.edu.cn/jsxsd/xspj/xspj_list.do', { dryRun: false });
}

describe('评教失败说明', () => {
  it('准备失败只展示中文说明', async () => {
    const result = await evaluation({ prepareFails: true });
    expect(result.items[0]).toMatchObject({ status: 'failed', message: '评教提交前准备失败，请稍后重试' });
  });
  for (const verifyFails of [false, true]) {
    it(`提交后回查失败=${verifyFails} 时说明尚未确认并避免重复提交`, async () => {
      const result = await evaluation({ verifyFails });
      expect(result.items[0].status).toBe('unknown');
      expect(result.items[0].message).toContain('避免重复提交');
      expect(result.items[0].message).not.toMatch(/SUBMIT_|UPSTREAM_/);
      expect(result.items[0].message).toContain(verifyFails ? '暂时无法核实' : '尚未确认');
    });
  }
});
