/**
 * [INPUT]: 依赖 Bun Test、LoginApplicationService ports、Portal UserService、CacheService 与隔离测试数据库
 * [OUTPUT]: 验证本地/学校登录结果、缺失学校资料的异步补全触发，以及资料缓存命中后的用户事实收敛
 * [POS]: tests 的 Identity/Profile 一致性回归套件，锁定登录不等待 Portal 且缓存不能绕过 users 回写
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { beforeEach, describe, expect, it } from 'bun:test';
import { eq } from 'drizzle-orm';
import { LoginApplicationService } from '../src/modules/identity/application/login-application.service';
import type {
  IdentityStorePort,
  LoginApplicationDependencies,
  SchoolAuthenticationPort,
} from '../src/modules/identity/application/login.ports';
import type { LoginUser } from '../src/modules/identity/domain/login';
import { UserService } from '../src/modules/campus-integrations/portal/user-service';
import { CacheService } from '../src/modules/cache/cache-service';
import { getDb, schema } from '../src/db';
import { clearSocialTestData } from './social-database';

class MemoryIdentityStore implements IdentityStorePort {
  user: LoginUser | null = null;
  touchCount = 0;

  async findByStudentId() { return this.user; }
  async touchLocalLogin() { this.touchCount += 1; }
}

class FakeSchool implements SchoolAuthenticationPort {
  requiresInteractionResult = false;
  authenticateCalls = 0;
  result: Awaited<ReturnType<SchoolAuthenticationPort['authenticate']>> = {
    kind: 'authenticated',
    user: { id: 7, studentId: '20260002', name: null, className: null },
    steps: [],
  };

  requiresInteraction() { return this.requiresInteractionResult; }
  async authenticate() {
    this.authenticateCalls += 1;
    return this.result;
  }
}

function createService(options: {
  store?: MemoryIdentityStore;
  school?: FakeSchool;
  onProfileCompletion?: (input: { userId: number; studentId: string }) => void;
} = {}) {
  const store = options.store ?? new MemoryIdentityStore();
  const school = options.school ?? new FakeSchool();
  const profileRequests: Array<{ userId: number; studentId: string }> = [];
  const dependencies = {
    school,
    identityStore: store,
    cipher: { matches: (encrypted: string, candidate: string) => encrypted === `encrypted:${candidate}` },
    token: { issue: async ({ userId }: { userId: number }) => `token:${userId}` },
    profile: {
      requestCompletion(input: { userId: number; studentId: string }) {
        profileRequests.push(input);
        options.onProfileCompletion?.(input);
      },
    },
    runtime: { now: () => new Date(1_000) },
  } as LoginApplicationDependencies;
  return { service: new LoginApplicationService(dependencies), store, school, profileRequests };
}

beforeEach(async () => {
  await clearSocialTestData(getDb());
});

describe('LoginApplicationService 资料补全触发', () => {
  it('本地快捷登录资料缺失时仍立即成功，并请求后台补全', async () => {
    const store = new MemoryIdentityStore();
    store.user = {
      id: 3,
      studentId: '20260001',
      name: null,
      className: null,
      encryptedPassword: 'encrypted:correct',
    };
    const testCase = createService({ store });

    const outcome = await testCase.service.execute({ username: '20260001', password: 'correct' });

    expect(outcome.kind).toBe('success');
    if (outcome.kind === 'success') expect(outcome.mode).toBe('local');
    expect(store.touchCount).toBe(1);
    expect(testCase.school.authenticateCalls).toBe(0);
    expect(testCase.profileRequests).toEqual([{ userId: 3, studentId: '20260001' }]);
  });

  it('学校认证成功且资料缺失时请求后台补全', async () => {
    const testCase = createService();

    const outcome = await testCase.service.execute({ username: '20260002', password: 'correct' });

    expect(outcome.kind).toBe('success');
    if (outcome.kind === 'success') expect(outcome.mode).toBe('school');
    expect(testCase.profileRequests).toEqual([{ userId: 7, studentId: '20260002' }]);
  });

  it('姓名和班级齐全时不重复请求资料', async () => {
    const store = new MemoryIdentityStore();
    store.user = {
      id: 4,
      studentId: '20260003',
      name: '完整用户',
      className: '完整班级',
      encryptedPassword: 'encrypted:correct',
    };
    const testCase = createService({ store });

    const outcome = await testCase.service.execute({ username: '20260003', password: 'correct' });

    expect(outcome.kind).toBe('success');
    expect(testCase.profileRequests).toHaveLength(0);
  });

  it('补全调度器同步失败也不反向破坏登录', async () => {
    const testCase = createService({
      onProfileCompletion: () => { throw new Error('profile scheduler failed'); },
    });

    const outcome = await testCase.service.execute({ username: '20260002', password: 'correct' });

    expect(outcome.kind).toBe('success');
  });
});

describe('UserService 用户事实收敛', () => {
  it('资料缓存命中时也补齐 users 中缺失的姓名和班级', async () => {
    const studentId = '20260004';
    const [user] = await getDb().insert(schema.users).values({
      studentId,
      name: null,
      className: null,
      encryptedPassword: 'encrypted',
      createdAt: new Date(),
      lastLoginAt: new Date(),
      lastActiveAt: new Date(),
    }).returning({ id: schema.users.id });
    await CacheService.set(`user:${studentId}`, {
      name: '缓存姓名',
      studentId,
      className: '缓存班级',
      identity: '学生',
      organizationCode: 'test-org',
    }, 60, 'portal');

    const result = await UserService.getUserInfo(user!.id, studentId);

    expect(result._meta.cached).toBe(true);
    const [persisted] = await getDb().select({
      name: schema.users.name,
      className: schema.users.className,
    }).from(schema.users).where(eq(schema.users.id, user!.id));
    expect(persisted).toEqual({ name: '缓存姓名', className: '缓存班级' });
  });

  it('资料缓存只补空字段，不覆盖 users 已有事实', async () => {
    const studentId = '20260005';
    const [user] = await getDb().insert(schema.users).values({
      studentId,
      name: '数据库姓名',
      className: null,
      encryptedPassword: 'encrypted',
      createdAt: new Date(),
      lastLoginAt: new Date(),
      lastActiveAt: new Date(),
    }).returning({ id: schema.users.id });
    await CacheService.set(`user:${studentId}`, {
      name: '旧缓存姓名',
      studentId,
      className: '缓存班级',
      identity: '学生',
      organizationCode: 'test-org',
    }, 60, 'portal');

    await UserService.getUserInfo(user!.id, studentId);

    const [persisted] = await getDb().select({
      name: schema.users.name,
      className: schema.users.className,
    }).from(schema.users).where(eq(schema.users.id, user!.id));
    expect(persisted).toEqual({ name: '数据库姓名', className: '缓存班级' });
  });
});
