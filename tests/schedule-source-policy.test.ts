/**
 * [INPUT]: 依赖 Bun Test、Academic 策略 store/application facade、管理路由与隔离测试目录
 * [OUTPUT]: 验证热切换持久化、请求快照、current/stale 顺序、legacy 错误优先级、锁接管与管理鉴权契约
 * [POS]: tests 的课表来源策略定向套件，不访问真实校园上游
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { afterAll, beforeAll, describe, expect, it } from 'bun:test';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, utimes, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Hono } from 'hono';
import { ScheduleFacadeApplicationService } from '../src/modules/academic/application/schedule-facade';
import { FileScheduleSourcePolicyStore } from '../src/modules/academic/infrastructure/file-schedule-source-policy-store';
import { ScheduleSourcePolicy } from '../src/modules/academic/schedule';
import type { ScheduleSource } from '../src/modules/academic/domain/schedule';
import type { ScheduleSourcePolicySnapshot } from '../src/modules/academic/domain/schedule-source-policy';
import { initDatabase } from '../src/db';
import { registerRoutes } from '../src/routes';
import { AppError, ErrorCode } from '../src/utils/errors';

type ReaderBehavior = {
  current?: () => Promise<any>;
  stale?: () => Promise<any | null>;
};

function rawResult(source: ScheduleSource, tag: string, stale = false) {
  return {
    data: { week: tag, courses: [], message: '' },
    _meta: { cached: stale, source, ...(stale ? { stale: true, refresh_failed: true } : {}) },
    _request: {
      queryDate: '2025-03-05',
      weekStartDate: '2025-03-03',
      cacheKey: `${source}:${tag}`,
      cache: stale ? 'miss' : 'bypass',
      lookup: 'weekly',
    },
  };
}

function createFacade(options: {
  mode?: 'jw-first' | 'portal-first';
  calls: string[];
  jw: ReaderBehavior;
  portal: ReaderBehavior;
  policyStatus?: () => Promise<ScheduleSourcePolicySnapshot>;
}) {
  const reader = (source: ScheduleSource, behavior: ReaderBehavior) => ({
    getCurrentSchedule: async () => {
      options.calls.push(`${source}:current`);
      return behavior.current ? behavior.current() : rawResult(source, `${source}-current`);
    },
    getStaleSchedule: async () => {
      options.calls.push(`${source}:stale`);
      return behavior.stale ? behavior.stale() : null;
    },
  });
  const snapshot: ScheduleSourcePolicySnapshot = {
    mode: options.mode ?? 'jw-first',
    updatedAt: '2026-07-28T00:00:00+08:00',
    updatedBy: 'test',
  };
  return new ScheduleFacadeApplicationService(
    reader('jw', options.jw),
    reader('portal', options.portal),
    { status: options.policyStatus ?? (async () => snapshot) },
  );
}

const request = {
  userId: 1,
  studentId: '2023001001',
  date: '2025-03-05',
  forceRefresh: true,
};

describe('ScheduleFacade current/stale 状态机', () => {
  it('jw-first 的 JW current 成功后不调用 Portal', async () => {
    const calls: string[] = [];
    const facade = createFacade({ calls, mode: 'jw-first', jw: {}, portal: {} });
    const result = await facade.getSchedule(request);
    expect(calls).toEqual(['jw:current']);
    expect(result._meta).toMatchObject({ source: 'jw', primary_source: 'jw', policy_mode: 'jw-first' });
  });

  it('jw-first 在 JW current 失败后采用 Portal current，不被 JW stale 截断', async () => {
    const calls: string[] = [];
    const facade = createFacade({
      calls,
      mode: 'jw-first',
      jw: {
        current: async () => { throw new Error('JW_FAILED'); },
        stale: async () => rawResult('jw', 'jw-stale', true),
      },
      portal: { current: async () => rawResult('portal', 'portal-current') },
    });
    const result = await facade.getSchedule(request);
    expect(calls).toEqual(['jw:current', 'portal:current']);
    expect(result.data.week).toBe('portal-current');
    expect(result._meta.fallback).toBe('portal');
  });

  it('portal-first 在 Portal current 失败后采用 JW current，不被 Portal stale 截断', async () => {
    const calls: string[] = [];
    const facade = createFacade({
      calls,
      mode: 'portal-first',
      jw: { current: async () => rawResult('jw', 'jw-current') },
      portal: {
        current: async () => { throw new Error('PORTAL_FAILED'); },
        stale: async () => rawResult('portal', 'portal-stale', true),
      },
    });
    const result = await facade.getSchedule(request);
    expect(calls).toEqual(['portal:current', 'jw:current']);
    expect(result.data.week).toBe('jw-current');
    expect(result._meta).toMatchObject({ fallback: 'jw', primary_source: 'portal' });
  });

  it('两个 current 都失败且双缓存存在时，两种模式都固定选择 JW stale', async () => {
    for (const mode of ['jw-first', 'portal-first'] as const) {
      const calls: string[] = [];
      const fail = async () => { throw new Error('UPSTREAM_FAILED'); };
      const facade = createFacade({
        calls,
        mode,
        jw: { current: fail, stale: async () => rawResult('jw', 'jw-stale', true) },
        portal: { current: fail, stale: async () => rawResult('portal', 'portal-stale', true) },
      });
      const result = await facade.getSchedule(request);
      expect(calls.slice(-1)).toEqual(['jw:stale']);
      expect(result.data.week).toBe('jw-stale');
      expect(result._meta).toMatchObject({ source: 'jw', fallback: 'stale', stale: true });
    }
  });

  it('JW stale 不存在时才读取 Portal stale', async () => {
    const calls: string[] = [];
    const fail = async () => { throw new Error('UPSTREAM_FAILED'); };
    const facade = createFacade({
      calls,
      mode: 'portal-first',
      jw: { current: fail, stale: async () => null },
      portal: { current: fail, stale: async () => rawResult('portal', 'portal-stale', true) },
    });
    const result = await facade.getSchedule(request);
    expect(calls).toEqual(['portal:current', 'jw:current', 'jw:stale', 'portal:stale']);
    expect(result.data.week).toBe('portal-stale');
  });

  it('双凭证失效时不读取 stale，保留 3003', async () => {
    const calls: string[] = [];
    const expired = async () => { throw new AppError(ErrorCode.CREDENTIAL_EXPIRED, 'expired'); };
    const facade = createFacade({
      calls,
      jw: { current: expired, stale: async () => rawResult('jw', 'jw-stale', true) },
      portal: { current: expired, stale: async () => rawResult('portal', 'portal-stale', true) },
    });
    try {
      await facade.getSchedule(request);
      throw new Error('expected rejection');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe(ErrorCode.CREDENTIAL_EXPIRED);
    }
    expect(calls).toEqual(['jw:current', 'portal:current']);
  });

  it('双 SCHEDULE_NOT_AVAILABLE 穷尽来源后返回合法空课表', async () => {
    const calls: string[] = [];
    const unavailable = async () => { throw new Error('SCHEDULE_NOT_AVAILABLE'); };
    const facade = createFacade({ calls, jw: { current: unavailable }, portal: { current: unavailable } });
    const result = await facade.getSchedule(request);
    expect(calls).toEqual(['jw:current', 'portal:current', 'jw:stale', 'portal:stale']);
    expect(result.data).toEqual({ week: '暂无', courses: [], message: '课表暂未公布' });
  });

  it('legacy 入口的备用源未公布不能吞掉主源高优先级错误', async () => {
    const calls: string[] = [];
    const timeout = new AppError(ErrorCode.UPSTREAM_TIMEOUT, 'JW_TIMEOUT');
    const facade = createFacade({
      calls,
      jw: { current: async () => { throw timeout; } },
      portal: { current: async () => { throw new Error('SCHEDULE_NOT_AVAILABLE'); } },
    });

    await expect(facade.getJwFirstSchedule(request)).rejects.toBe(timeout);
    expect(calls).toEqual(['jw:current', 'portal:current', 'jw:stale', 'portal:stale']);
  });

  it('请求开始后切换策略不改变该请求 plan，下一请求读取新快照', async () => {
    const calls: string[] = [];
    let release!: () => void;
    let snapshot: ScheduleSourcePolicySnapshot = {
      mode: 'jw-first', updatedAt: 'old', updatedBy: 'test',
    };
    let firstJw = true;
    const facade = createFacade({
      calls,
      jw: {
        current: async () => {
          if (!firstJw) return rawResult('jw', 'jw-next');
          firstJw = false;
          await new Promise<void>((resolve) => { release = resolve; });
          throw new Error('JW_FAILED');
        },
      },
      portal: { current: async () => rawResult('portal', 'portal-current') },
      policyStatus: async () => snapshot,
    });

    const inFlight = facade.getSchedule(request);
    while (!calls.includes('jw:current')) await Promise.resolve();
    snapshot = { mode: 'portal-first', updatedAt: 'new', updatedBy: 'admin' };
    release();
    const first = await inFlight;
    expect(calls).toEqual(['jw:current', 'portal:current']);
    expect(first._meta).toMatchObject({ policy_mode: 'jw-first' });

    calls.length = 0;
    const second = await facade.getSchedule(request);
    expect(calls).toEqual(['portal:current']);
    expect(second._meta).toMatchObject({ policy_mode: 'portal-first' });
  });
});

describe('FileScheduleSourcePolicyStore', () => {
  it('无状态文件时回落 env/default，写入原子持久化并跨实例传播状态', async () => {
    const root = await mkdtemp(join(tmpdir(), 'schedule-policy-'));
    const stateFile = join(root, 'policy.json');
    try {
      const first = new FileScheduleSourcePolicyStore(stateFile, '');
      expect(await first.read()).toMatchObject({ mode: 'jw-first' });
      expect(await first.write('portal-first', 'admin-a')).toMatchObject({ mode: 'portal-first' });

      const second = new FileScheduleSourcePolicyStore(stateFile, 'jw-first');
      expect(await second.read()).toMatchObject({ mode: 'portal-first', updatedBy: 'admin-a' });
      expect(await second.write('jw-first', 'admin-b')).toMatchObject({ mode: 'jw-first' });
      expect(await first.read()).toMatchObject({ mode: 'jw-first', updatedBy: 'admin-b' });

      const persisted = JSON.parse(await readFile(stateFile, 'utf8'));
      expect(persisted).toEqual({
        mode: 'jw-first',
        updatedAt: expect.any(String),
        updatedBy: 'admin-b',
      });
      expect((await readdir(root)).some((name) => name.endsWith('.tmp'))).toBe(false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('非法 env 安全回落 jw-first，损坏文件保留最后有效快照', async () => {
    const root = await mkdtemp(join(tmpdir(), 'schedule-policy-corrupt-'));
    const stateFile = join(root, 'policy.json');
    try {
      const store = new FileScheduleSourcePolicyStore(stateFile, 'invalid-mode');
      expect((await store.read()).mode).toBe('jw-first');
      const valid = await store.write('portal-first', 'admin');
      await writeFile(stateFile, '{broken', 'utf8');
      expect(await store.read()).toEqual(valid);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('恢复遗留单文件锁，并让旧 owner 释放时无法删除新 owner 锁', async () => {
    const root = await mkdtemp(join(tmpdir(), 'schedule-policy-lock-'));
    const stateFile = join(root, 'policy.json');
    const lockDirectory = `${stateFile}.lock`;
    const staleAt = new Date(Date.now() - 60_000);
    try {
      const store = new FileScheduleSourcePolicyStore(stateFile, 'jw-first');

      // 兼容上一版可能遗留的单文件锁。
      await writeFile(lockDirectory, 'legacy-owner', 'utf8');
      await utimes(lockDirectory, staleAt, staleAt);
      expect(await store.write('portal-first', 'legacy-recovery')).toMatchObject({
        mode: 'portal-first',
      });
      await expect(stat(lockDirectory)).rejects.toThrow();

      // 模拟 A 超时后 B 接管；A 的 finally 只能删除 owner-A，不能删除 owner-B。
      await mkdir(lockDirectory, { mode: 0o700 });
      const oldOwnerFile = join(lockDirectory, 'owner-A');
      await writeFile(oldOwnerFile, 'A', 'utf8');
      await utimes(oldOwnerFile, staleAt, staleAt);
      const newLock = await (store as any).acquireLock(lockDirectory) as {
        directory: string;
        ownerFile: string;
      };
      await expect(
        (store as any).assertLockOwned({ directory: lockDirectory, ownerFile: oldOwnerFile }),
      ).rejects.toThrow('写锁已被其他进程接管');
      await (store as any).releaseLock({ directory: lockDirectory, ownerFile: oldOwnerFile });
      expect((await readdir(lockDirectory)).some((entry) => join(lockDirectory, entry) === newLock.ownerFile)).toBe(true);

      await (store as any).releaseLock(newLock);
      await expect(stat(lockDirectory)).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('owner 进程仍存活时不按固定时长接管目录锁', async () => {
    const root = await mkdtemp(join(tmpdir(), 'schedule-policy-live-lock-'));
    const stateFile = join(root, 'policy.json');
    const lockDirectory = `${stateFile}.lock`;
    const ownerToken = `${process.pid}-live-owner`;
    const ownerFile = join(lockDirectory, `owner-${ownerToken}`);
    const staleAt = new Date(Date.now() - 60_000);
    try {
      const store = new FileScheduleSourcePolicyStore(stateFile, 'jw-first');
      await mkdir(lockDirectory, { mode: 0o700 });
      await writeFile(ownerFile, ownerToken, 'utf8');
      await utimes(ownerFile, staleAt, staleAt);

      expect(await (store as any).tryRecoverStaleLock(lockDirectory, 'contender')).toBeNull();
      expect((await readdir(lockDirectory))).toContain(`owner-${ownerToken}`);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('新鲜空锁目录保留 owner 标记的建立窗口', async () => {
    const root = await mkdtemp(join(tmpdir(), 'schedule-policy-empty-lock-'));
    const stateFile = join(root, 'policy.json');
    const lockDirectory = `${stateFile}.lock`;
    try {
      const store = new FileScheduleSourcePolicyStore(stateFile, 'jw-first');
      await mkdir(lockDirectory, { mode: 0o700 });

      expect(await (store as any).tryRecoverStaleLock(lockDirectory, 'contender')).toBeNull();
      expect((await stat(lockDirectory)).isDirectory()).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe('课表来源策略管理 API', () => {
  let app: Hono;
  let cookie = '';

  beforeAll(async () => {
    initDatabase();
    app = new Hono();
    registerRoutes(app);
    const login = await app.request('http://localhost/api/admin/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'test-admin', password: 'test-admin-password' }),
    });
    cookie = (login.headers.get('set-cookie') || '').split(';')[0];
  });

  afterAll(async () => {
    await ScheduleSourcePolicy.configure('jw-first', 'test-cleanup');
  });

  it('受后台会话保护，并支持 GET/PUT 无重启热切换', async () => {
    const unauthorized = await app.request('http://localhost/api/admin/academic/schedule-source-policy');
    expect(unauthorized.status).toBe(401);

    const before = await app.request('http://localhost/api/admin/academic/schedule-source-policy', {
      headers: { Cookie: cookie },
    });
    expect(before.status).toBe(200);

    const update = await app.request('http://localhost/api/admin/academic/schedule-source-policy', {
      method: 'PUT',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: 'portal-first' }),
    });
    expect(update.status).toBe(200);
    const updateBody = await update.json() as any;
    expect(updateBody.data).toEqual({
      mode: 'portal-first',
      updatedAt: expect.any(String),
      updatedBy: 'test-admin',
    });

    const after = await app.request('http://localhost/api/admin/academic/schedule-source-policy', {
      headers: { Cookie: cookie },
    });
    expect((await after.json() as any).data).toEqual(updateBody.data);
  });

  it('拒绝缺失或非法 mode', async () => {
    for (const body of [{}, { mode: 'default' }, { mode: 'portal' }]) {
      const response = await app.request('http://localhost/api/admin/academic/schedule-source-policy', {
        method: 'PUT',
        headers: { Cookie: cookie, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      expect(response.status).toBe(400);
      expect((await response.json() as any).error_code).toBe(ErrorCode.PARAM_ERROR);
    }
  });
});
