/**
 * [INPUT]: 依赖 Bun Test、LoginApplicationService ports、SqliteIdentityStore、测试数据库与 Bun SQLite 故障触发器
 * [OUTPUT]: 提供本地/验证码/Portal-JW 分支、激活全失败仍提交 CAS 但不签 JWT，及用户凭证事务回滚的 Identity/Login 回归测试
 * [POS]: tests 的登录应用边界套件，既验证纯用例决策，也证明 SQLite 失败不会暴露半写入身份事实
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'bun:test';
import { Database } from 'bun:sqlite';
import { eq } from 'drizzle-orm';
import { LoginApplicationService } from '../src/modules/identity/application/login-application.service';
import type {
  CampusLoginPort,
  CampusSession,
  IdentityStorePort,
  LoginApplicationConfig,
} from '../src/modules/identity/application/login.ports';
import type { LoginCredentialSet, LoginUser } from '../src/modules/identity/domain/login';
import { SqliteIdentityStore } from '../src/modules/identity/infrastructure/sqlite-identity.store';
import { config } from '../src/config';
import { getDb, schema } from '../src/db';
import { clearSocialTestData } from './social-database';

const session: CampusSession = { opaque: { id: 'campus-session' } };

class FakeCampus implements CampusLoginPort {
  loginResult = { success: true, portalToken: 'portal-token' as string | null, steps: [] };
  portalResult = { token: null as string | null, steps: [] };
  jwResult = { success: true, steps: [] };
  execution = 'execution';
  loginCalls = 0;
  onStart: (() => void) | null = null;
  onLogin: (() => void) | null = null;

  async start() { this.onStart?.(); return { session, execution: this.execution }; }
  restore() { return session; }
  snapshot() { return '{"cookies":[]}'; }
  async login() { this.loginCalls += 1; this.onLogin?.(); return this.loginResult; }
  async getCaptcha() { return new Uint8Array([1, 2, 3]).buffer; }
  async getExecution() { return this.execution; }
  async exchangePortalToken() { return this.portalResult; }
  async exchangeJwSession() { return this.jwResult; }
}

class MemoryIdentityStore implements IdentityStorePort {
  user: LoginUser | null = null;
  persisted: LoginCredentialSet | null = null;
  touchCount = 0;

  async findByStudentId() { return this.user; }
  async touchLocalLogin() { this.touchCount += 1; }
  async commitRealSchoolLogin(input: Parameters<IdentityStorePort['commitRealSchoolLogin']>[0]) {
    this.persisted = input.credentials;
    return this.user || {
      id: 7,
      studentId: input.studentId,
      name: null,
      className: null,
      encryptedPassword: input.encryptedPassword,
    };
  }
}

function createService(options: {
  campus?: FakeCampus;
  store?: MemoryIdentityStore;
  interactive?: boolean;
  profileError?: boolean;
} = {}) {
  const campus = options.campus || new FakeCampus();
  const store = options.store || new MemoryIdentityStore();
  let now = 1_000;
  let issuedTokenCount = 0;
  const appConfig: LoginApplicationConfig = { captchaSessionTtlMs: 60_000, maxCaptchaSessions: 10 };
  const service = new LoginApplicationService({
    campus,
    recovery: { requiresInteractiveLogin: async () => Boolean(options.interactive) },
    identityStore: store,
    cipher: {
      encrypt: (password) => `encrypted:${password}`,
      matches: (encrypted, candidate) => encrypted === `encrypted:${candidate}`,
    },
    token: { issue: async ({ userId }) => {
      issuedTokenCount += 1;
      return `token:${userId}`;
    } },
    profile: {
      backfill: async () => {
        if (options.profileError) throw new Error('portal profile failed');
        return { name: '测试用户', className: '测试班级' };
      },
    },
    runtime: {
      now: () => new Date(now),
      createId: () => 'captcha-session-id',
      encodeBase64: () => 'AQID',
    },
    config: appConfig,
  });
  return {
    service,
    campus,
    store,
    issuedTokenCount: () => issuedTokenCount,
    advanceTime: (milliseconds: number) => { now += milliseconds; },
  };
}

let triggerDatabase: Database | null = null;

beforeEach(async () => {
  await clearSocialTestData(getDb());
});

afterEach(() => {
  if (triggerDatabase) {
    triggerDatabase.exec('DROP TRIGGER IF EXISTS fail_identity_credentials');
    triggerDatabase.close();
    triggerDatabase = null;
  }
});

describe('LoginApplicationService', () => {
  it('密码命中且无交互恢复标记时走本地快捷登录，不访问校园端口', async () => {
    const store = new MemoryIdentityStore();
    store.user = {
      id: 3,
      studentId: '20260001',
      name: '本地用户',
      className: '本地班级',
      encryptedPassword: 'encrypted:correct',
    };
    const { service, campus } = createService({ store });

    const outcome = await service.execute({ username: '20260001', password: 'correct' });

    expect(outcome.kind).toBe('success');
    if (outcome.kind === 'success') expect(outcome.mode).toBe('local');
    expect(store.touchCount).toBe(1);
    expect(campus.loginCalls).toBe(0);
  });

  it('验证码会话过 TTL 但未周期清理时仍可重试，显式清理后才失效', async () => {
    const campus = new FakeCampus();
    campus.loginResult = { success: false, portalToken: null, steps: [], needCaptcha: true } as any;
    const { service, advanceTime } = createService({ campus });

    const challenged = await service.execute({ username: '20260002', password: 'wrong' });
    expect(challenged.kind).toBe('failure');
    if (challenged.kind !== 'failure') throw new Error('expected challenge');
    expect(challenged.reason).toBe('captcha-required');
    expect(challenged.challenge).toEqual({ sessionId: 'captcha-session-id', captchaImage: 'AQID' });

    advanceTime(60_001);
    campus.loginResult = { success: true, portalToken: 'portal-token', steps: [] };
    const retried = await service.execute({
      username: '20260002',
      password: 'correct',
      captcha: '1234',
      sessionId: challenged.challenge!.sessionId,
    });
    expect(retried.kind).toBe('success');

    campus.loginResult = { success: false, portalToken: null, steps: [], needCaptcha: true } as any;
    const secondChallenge = await service.execute({ username: '20260002', password: 'wrong-again' });
    expect(secondChallenge.kind).toBe('failure');
    if (secondChallenge.kind !== 'failure') throw new Error('expected second challenge');
    advanceTime(60_001);
    service.cleanupExpiredCaptchaSessions();

    const cleaned = await service.execute({
      username: '20260002',
      password: 'correct',
      captcha: '1234',
      sessionId: secondChallenge.challenge!.sessionId,
    });
    expect(cleaned.kind).toBe('failure');
    if (cleaned.kind === 'failure') expect(cleaned.reason).toBe('captcha-session-missing');
  });

  it('CAS 日志耗时只统计校园 login 提交，不包含 execution 获取', async () => {
    const campus = new FakeCampus();
    const testCase = createService({ campus });
    campus.onStart = () => testCase.advanceTime(5_000);
    campus.onLogin = () => testCase.advanceTime(25);

    const outcome = await testCase.service.execute({ username: '20260006', password: 'pass' });

    expect(outcome.kind).toBe('success');
    expect(outcome.durationMs).toBe(25);
  });

  it('Portal-only 与 JW-only 均可登录，二者同时失败仍提交 CAS 事实但不签发 JWT', async () => {
    const portalCampus = new FakeCampus();
    portalCampus.jwResult = { success: false, steps: [] };
    const portalCase = createService({ campus: portalCampus, profileError: true });
    const portalOutcome = await portalCase.service.execute({ username: '20260003', password: 'pass' });
    expect(portalOutcome.kind).toBe('success');
    if (portalOutcome.kind === 'success') expect(portalOutcome.mode).toBe('portal-only');
    expect(portalCase.store.persisted?.portalToken).toBe('portal-token');
    expect(portalCase.store.persisted?.jwCookieJar).toBeNull();

    const jwCampus = new FakeCampus();
    jwCampus.loginResult = { success: true, portalToken: null, steps: [] };
    jwCampus.portalResult = { token: null, steps: [] };
    const jwCase = createService({ campus: jwCampus });
    const jwOutcome = await jwCase.service.execute({ username: '20260004', password: 'pass' });
    expect(jwOutcome.kind).toBe('success');
    expect(jwCase.store.persisted?.portalToken).toBeNull();
    expect(jwCase.store.persisted?.jwCookieJar).toBeTruthy();

    const rejectedCampus = new FakeCampus();
    rejectedCampus.loginResult = { success: true, portalToken: null, steps: [] };
    rejectedCampus.portalResult = { token: null, steps: [] };
    rejectedCampus.jwResult = { success: false, steps: [] };
    const rejectedCase = createService({ campus: rejectedCampus });
    const rejected = await rejectedCase.service.execute({ username: '20260005', password: 'pass' });
    expect(rejected.kind).toBe('failure');
    if (rejected.kind === 'failure') expect(rejected.reason).toBe('school-activation-failed');
    expect(rejectedCase.store.persisted).toEqual({
      casCookieJar: '{"cookies":[]}',
      portalToken: null,
      jwCookieJar: null,
    });
    expect(rejectedCase.issuedTokenCount()).toBe(0);
  });
});

describe('SqliteIdentityStore 事务', () => {
  it('凭证写入被 SQLite 中止时回滚同事务内的新用户与已有用户更新', async () => {
    const existing = await getDb().insert(schema.users).values({
      studentId: '20268888',
      encryptedPassword: 'old-encrypted',
      createdAt: new Date(),
      lastLoginAt: new Date(),
      lastActiveAt: new Date(),
    }).returning({ id: schema.users.id });

    triggerDatabase = new Database(config.dbPath);
    triggerDatabase.exec(`
      CREATE TRIGGER fail_identity_credentials
      BEFORE INSERT ON credentials
      BEGIN
        SELECT RAISE(ABORT, 'forced credential failure');
      END;
    `);

    const store = new SqliteIdentityStore();
    await expect(store.commitRealSchoolLogin({
      studentId: '20269999',
      encryptedPassword: 'encrypted',
      credentials: {
        casCookieJar: '{"cookies":[]}',
        portalToken: 'portal-token',
        jwCookieJar: '{"cookies":[]}',
      },
      at: new Date(),
    })).rejects.toThrow('forced credential failure');

    await expect(store.commitRealSchoolLogin({
      studentId: '20268888',
      encryptedPassword: 'new-encrypted',
      credentials: {
        casCookieJar: '{"cookies":[]}',
        portalToken: 'portal-token',
        jwCookieJar: null,
      },
      at: new Date(),
    })).rejects.toThrow('forced credential failure');

    const users = await getDb().select().from(schema.users).where(eq(schema.users.studentId, '20269999'));
    const unchangedExisting = await getDb().select().from(schema.users).where(eq(schema.users.id, existing[0]!.id));
    const credentials = await getDb().select().from(schema.credentials);
    expect(users).toHaveLength(0);
    expect(unchangedExisting[0]?.encryptedPassword).toBe('old-encrypted');
    expect(credentials).toHaveLength(0);
  });
});
