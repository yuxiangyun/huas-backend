/**
 * [INPUT]: 依赖 统一路由、双源课表服务、策略门面与可控上游状态
 * [OUTPUT]: 验证 JW/Portal 双源 fallback、错误优先级、空课表与热策略切换
 * [POS]: tests/business-flows 的独立能力用例集，由聚合入口在进程级 mock 隔离内装配
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { describe, expect, it } from 'bun:test';
import {
  Hono,
  ErrorCode,
  upstreamState,
  registerRoutes,
  CacheService,
  makeSchedulePayload,
  createUser,
} from './harness';

describe('默认课表路由兜底', () => {
  it('JW 课表失败时，/api/schedule 会回退到 portal 课表并标记 source=portal', async () => {
    const userId = await createUser('2023001778', 'pass-schedule-fallback');
    const app = new Hono();
    registerRoutes(app);

    const { generateToken } = await import('../../src/auth/jwt.ts');
    const token = await generateToken({ userId, studentId: '2023001778', name: 'name-2023001778' });

    upstreamState.upstreamResolver = async (_userId: number, mode: 'jw' | 'portal') => {
      if (mode === 'jw') {
        throw new Error('GET_SCHEDULE_FAILED');
      }
      return makeSchedulePayload('portal-route-fallback');
    };

    const res = await app.request('http://localhost/api/schedule?date=2025-03-05', {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(body._meta?.source).toBe('portal');
    expect(body.data.courses[0].name).toBe('course-portal-route-fallback');
  });

  it('JW 课表失败且 Portal 兜底超时时，/api/schedule 返回更具体的兜底错误', async () => {
    const userId = await createUser('2023001781', 'pass-schedule-timeout');
    const app = new Hono();
    registerRoutes(app);

    const { generateToken } = await import('../../src/auth/jwt.ts');
    const token = await generateToken({ userId, studentId: '2023001781', name: 'name-2023001781' });

    upstreamState.upstreamResolver = async (_userId: number, mode: 'jw' | 'portal') => {
      if (mode === 'jw') {
        throw new Error('GET_SCHEDULE_FAILED');
      }
      throw new Error('REQUEST_TIMEOUT');
    };

    const res = await app.request('http://localhost/api/schedule?date=2025-03-05', {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(504);
    const body = await res.json() as any;
    expect(body.success).toBe(false);
    expect(body.error_code).toBe(ErrorCode.UPSTREAM_TIMEOUT);
  });

  it('JW 与 Portal 凭证都失效时，旧缓存不能把 3003 包装成成功响应', async () => {
    const studentId = '2023001784';
    const userId = await createUser(studentId, 'pass-schedule-expired');
    const app = new Hono();
    registerRoutes(app);

    await CacheService.set(`schedule:${studentId}:2025-03-03`, makeSchedulePayload('jw-stale'), 0, 'jw');
    await CacheService.set(
      `portal-schedule:${studentId}:2025-03-03:2025-03-09`,
      makeSchedulePayload('portal-stale'),
      0,
      'portal'
    );
    upstreamState.upstreamInjectedError = new Error('SESSION_EXPIRED');

    const { generateToken } = await import('../../src/auth/jwt.ts');
    const token = await generateToken({ userId, studentId, name: `name-${studentId}` });
    const res = await app.request('http://localhost/api/schedule?date=2025-03-05&refresh=true', {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(401);
    const body = await res.json() as any;
    expect(body.success).toBe(false);
    expect(body.error_code).toBe(ErrorCode.CREDENTIAL_EXPIRED);
  });

  it('Portal 周课表失败时，/api/v1/schedule 会回退到 JW 课表并标记 source=jw', async () => {
    const userId = await createUser('2023001779', 'pass-portal-weekly-fallback');
    const app = new Hono();
    registerRoutes(app);

    const { generateToken } = await import('../../src/auth/jwt.ts');
    const token = await generateToken({ userId, studentId: '2023001779', name: 'name-2023001779' });

    upstreamState.upstreamResolver = async (_userId: number, mode: 'jw' | 'portal') => {
      if (mode === 'portal') {
        throw new Error('GET_SCHEDULE_FAILED');
      }
      return makeSchedulePayload('jw-route-fallback');
    };

    const res = await app.request('http://localhost/api/v1/schedule?startDate=2025-03-03&endDate=2025-03-09', {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(body._meta?.source).toBe('jw');
    expect(body.data.courses[0].name).toBe('course-jw-route-fallback');
  });

  it('Portal 周课表失败且 JW 兜底超时时，/api/v1/schedule 返回更具体的兜底错误', async () => {
    const userId = await createUser('2023001782', 'pass-portal-timeout');
    const app = new Hono();
    registerRoutes(app);

    const { generateToken } = await import('../../src/auth/jwt.ts');
    const token = await generateToken({ userId, studentId: '2023001782', name: 'name-2023001782' });

    upstreamState.upstreamResolver = async (_userId: number, mode: 'jw' | 'portal') => {
      if (mode === 'portal') {
        throw new Error('GET_SCHEDULE_FAILED');
      }
      throw new Error('REQUEST_TIMEOUT');
    };

    const res = await app.request('http://localhost/api/v1/schedule?startDate=2025-03-03&endDate=2025-03-09', {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(504);
    const body = await res.json() as any;
    expect(body.success).toBe(false);
    expect(body.error_code).toBe(ErrorCode.UPSTREAM_TIMEOUT);
  });

  it('Portal 周课表无数据时，/api/v1/schedule 直接返回空课表而不回退 JW', async () => {
    const userId = await createUser('2023001783', 'pass-portal-empty-week');
    const app = new Hono();
    registerRoutes(app);
    const { generateToken } = await import('../../src/auth/jwt.ts');
    const token = await generateToken({ userId, studentId: '2023001783', name: 'name-2023001783' });

    let jwCalled = false;
    upstreamState.upstreamResolver = async (_userId: number, mode: 'jw' | 'portal') => {
      if (mode === 'jw') {
        jwCalled = true;
        throw new Error('REQUEST_TIMEOUT');
      }
      throw new Error('SCHEDULE_NOT_AVAILABLE');
    };

    const res = await app.request('http://localhost/api/v1/schedule?startDate=2025-02-03&endDate=2025-02-09', {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(body.data).toEqual({
      week: '暂无',
      courses: [],
      message: '课表暂未公布',
    });
    expect(jwCalled).toBe(false);
  });

  it('Portal 非周视图请求失败时，不会错误回退到 JW 周课表', async () => {
    const userId = await createUser('2023001780', 'pass-portal-monthly');
    const app = new Hono();
    registerRoutes(app);

    const { generateToken } = await import('../../src/auth/jwt.ts');
    const token = await generateToken({ userId, studentId: '2023001780', name: 'name-2023001780' });

    let jwCalled = false;
    upstreamState.upstreamResolver = async (_userId: number, mode: 'jw' | 'portal') => {
      if (mode === 'jw') {
        jwCalled = true;
      }
      throw new Error('GET_SCHEDULE_FAILED');
    };

    const res = await app.request('http://localhost/api/v1/schedule?startDate=2025-03-01&endDate=2025-03-31', {
      headers: { Authorization: `Bearer ${token}` },
    });

    expect(res.status).toBe(500);
    expect(jwCalled).toBe(false);
  });

  it('管理策略热切到 portal-first 后，/api/schedule 无需重启即按 Portal→JW 执行', async () => {
    const studentId = '2023001785';
    const userId = await createUser(studentId, 'pass-policy-hot-switch');
    const app = new Hono();
    registerRoutes(app);
    const { ScheduleSourcePolicy } = await import('../../src/modules/academic/schedule.ts');
    const { generateToken } = await import('../../src/auth/jwt.ts');
    const token = await generateToken({ userId, studentId, name: `name-${studentId}` });
    const modes: Array<'jw' | 'portal'> = [];

    await ScheduleSourcePolicy.configure('portal-first', 'business-flow-test');
    try {
      upstreamState.upstreamResolver = async (_userId: number, mode: 'jw' | 'portal') => {
        modes.push(mode);
        if (mode === 'portal') throw new Error('PORTAL_FAILED');
        return makeSchedulePayload('jw-after-hot-switch');
      };

      const res = await app.request('http://localhost/api/schedule?date=2025-03-05&refresh=true', {
        headers: { Authorization: `Bearer ${token}` },
      });
      expect(res.status).toBe(200);
      const body = await res.json() as any;
      expect(modes).toEqual(['portal', 'jw']);
      expect(body.data.courses[0].name).toBe('course-jw-after-hot-switch');
      expect(body._meta).toMatchObject({
        source: 'jw',
        primary_source: 'portal',
        policy_mode: 'portal-first',
        fallback: 'jw',
      });
    } finally {
      await ScheduleSourcePolicy.configure('jw-first', 'business-flow-test-cleanup');
    }
  });
});
