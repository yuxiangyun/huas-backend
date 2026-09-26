/**
 * [INPUT]: 依赖业务流上游替身、可控时钟、真实 SchoolAuthentication 提交与 SchoolRecovery
 * [OUTPUT]: 验证 CAS 安全读取共享重试、execution 缺失非超时、五秒固定窗口、Portal HTTP 故障的统一 3005 语义、本地登录隔离、能力失败隔离、换票合流及新登录阻断迟到恢复
 * [POS]: tests/business-flows 的登录恢复事故回归，以调用次数和最终凭证事实证明兼容性
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { describe, expect, it, spyOn } from 'bun:test';
import { schoolUnavailable, schoolTimeout } from '../../src/modules/campus-integrations/school-access/errors';
import { Hono, authRoutes, authBehavior, ticketBehavior, createUser, schoolStateStore, recovery, requestContext, seedCredential, clearBaseCredentials, getDb, config } from './harness';
import { SchoolAuthentication } from '../../src/modules/campus-integrations/school-access/authentication';
import { readSchoolLoginEpoch } from '../../src/modules/campus-integrations/school-access/school-login-context';

function clockAtNow() {
  let now = Date.now();
  const clock = spyOn(Date, 'now').mockImplementation(() => now);
  return { advance: (ms: number) => { now += ms; }, restore: () => clock.mockRestore() };
}

async function realLogin(studentId: string) {
  const previous = authBehavior.login;
  authBehavior.login = async () => ({ success: true, portalToken: 'new-login-portal', steps: [] });
  try { return await new SchoolAuthentication().authenticate({ username: studentId, password: 'password' }); }
  finally { authBehavior.login = previous; }
}

describe('五秒恢复冷却与真实登录隔离', () => {
  it('Portal HTTP 故障证据在 TGC 和 CAS 后换票两条恢复路径中都保留五秒冷却', async () => {
    for (const withTgc of [true, false]) {
      const userId = await createUser(`cooldown-portal-http-${withTgc}`, 'password');
      if (withTgc) await seedCredential(userId, 'cas_tgc', null, '{"cookies":[]}');
      const clock = clockAtNow();
      let casCalls = 0;
      let portalCalls = 0;
      const failure = new Error('PORTAL_TOKEN_HTTP_503');
      authBehavior.login = async () => { casCalls += 1; return { success: true, portalToken: null, steps: [] }; };
      ticketBehavior.exchangePortalToken = async () => {
        portalCalls += 1;
        throw failure;
      };
      try {
        await expect(recovery.ensure(userId, 'portal_jwt', requestContext())).rejects.toMatchObject({ code: 3005 });
        clock.advance(4_999);
        await expect(recovery.ensure(userId, 'portal_jwt', requestContext())).rejects.toMatchObject({ code: 3005 });
        expect(portalCalls).toBe(config.retry.businessMaxAttempts);
        expect(casCalls).toBe(withTgc ? 0 : 1);
        expect(await schoolStateStore.requiresInteraction(userId)).toBe(false);
        clock.advance(1);
        ticketBehavior.exchangePortalToken = async () => { portalCalls += 1; return { token: 'restored', steps: [] }; };
        expect((await recovery.ensure(userId, 'portal_jwt', requestContext()))?.value).toBe('restored');
        expect(portalCalls).toBe(config.retry.businessMaxAttempts + 1);
        expect(casCalls).toBe(withTgc ? 0 : 1);
      } finally { clock.restore(); }
    }
  });

  it('本地登录不访问上游；跨来源连续失败不续期，五秒到点并发只登录一次 CAS', async () => {
    const userId = await createUser('cooldown-local', 'local-password');
    const clock = clockAtNow();
    let calls = 0;
    authBehavior.login = async () => { calls += 1; return { success: false, steps: [] }; };
    try {
      await expect(recovery.ensure(userId, 'portal_jwt', requestContext())).rejects.toMatchObject({ code: 3005 });
      const app = new Hono().route('/auth', authRoutes);
      const response = await app.request('http://localhost/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'cooldown-local', password: 'local-password' }),
      });
      expect(response.status).toBe(200);
      expect((await response.json() as any).data.token).toBeString();
      expect(readSchoolLoginEpoch(getDb(), userId)).toBe(0);
      clock.advance(4_999);
      for (const system of ['jw_session', 'portal_jwt', 'cas_tgc'] as const) {
        await expect(recovery.ensure(userId, system, requestContext())).rejects.toMatchObject({ code: 3005 });
      }
      expect(calls).toBe(1);
      clock.advance(1);
      authBehavior.login = async () => { calls += 1; return { success: true, portalToken: 'recovered', steps: [] }; };
      const results = await Promise.all(Array.from({ length: 12 }, (_, index) => index % 2
        ? recovery.ensure(userId, 'jw_session', requestContext())
        : recovery.ensure(userId, 'portal_jwt', requestContext())));
      expect(results.every(Boolean)).toBe(true);
      expect(calls).toBe(2);
    } finally { clock.restore(); }
  });

  it('连续多轮失败始终只等五秒，不再累积成六十秒', async () => {
    const userId = await createUser('cooldown-repeat', 'password');
    const clock = clockAtNow();
    let calls = 0;
    authBehavior.login = async () => { calls += 1; return { success: false, steps: [] }; };
    try {
      for (let round = 1; round <= 5; round += 1) {
        await expect(recovery.ensure(userId, 'cas_tgc', requestContext())).rejects.toMatchObject({ code: 3005 });
        expect(calls).toBe(round);
        clock.advance(4_999);
        await expect(recovery.ensure(userId, 'cas_tgc', requestContext())).rejects.toMatchObject({ code: 3005 });
        expect(calls).toBe(round);
        clock.advance(1);
      }
    } finally { clock.restore(); }
  });

  it('维护页和 execution 缺失保留上游故障语义，五秒后可恢复且不要求验证码', async () => {
    for (const failure of ['maintenance', 'execution'] as const) {
      const userId = await createUser(`cooldown-${failure}`, 'password');
      const clock = clockAtNow();
      let calls = 0;
      authBehavior.getExecution = async () => {
        calls += 1;
        if (failure === 'maintenance') throw new Error('CAS_MAINTENANCE');
        return null;
      };
      try {
        for (let index = 0; index < 4; index += 1) {
          const attempt = recovery.ensure(userId, 'portal_jwt', requestContext());
          await expect(attempt).rejects.toMatchObject({ code: 3005, httpStatus: 503 });
        }
        expect(calls).toBe(failure === 'maintenance' ? config.retry.businessMaxAttempts : 1);
        expect(await schoolStateStore.requiresInteraction(userId)).toBe(false);
        clock.advance(5_000);
        authBehavior.getExecution = async () => { calls += 1; return 'execution'; };
        expect(await recovery.ensure(userId, 'portal_jwt', requestContext())).not.toBeNull();
        expect(calls).toBe((failure === 'maintenance' ? config.retry.businessMaxAttempts : 1) + 1);
      } finally { clock.restore(); }
    }
  });

  it('JW 换票失败不阻断 Portal，五秒内保留超时语义，到期合并 JW 换票而不登录 CAS', async () => {
    const userId = await createUser('cooldown-jw', 'password');
    await seedCredential(userId, 'cas_tgc', null, '{"cookies":[]}');
    const clock = clockAtNow();
    let jwCalls = 0;
    let casCalls = 0;
    authBehavior.login = async () => { casCalls += 1; return { success: false, steps: [] }; };
    ticketBehavior.exchangeJwSession = async () => {
      jwCalls += 1;
      throw schoolTimeout();
    };
    try {
      await expect(recovery.ensure(userId, 'jw_session', requestContext())).rejects.toMatchObject({ code: 3004 });
      expect(await recovery.ensure(userId, 'portal_jwt', requestContext())).not.toBeNull();
      clock.advance(4_999);
      await expect(recovery.ensure(userId, 'jw_session', requestContext())).rejects.toMatchObject({ code: 3004 });
      expect(jwCalls).toBe(config.retry.jwActivationMax);
      clock.advance(1);
      ticketBehavior.exchangeJwSession = async () => { jwCalls += 1; return { success: true, steps: [] }; };
      expect((await Promise.all(Array.from({ length: 10 }, () =>
        recovery.ensure(userId, 'jw_session', requestContext())))).every(Boolean)).toBe(true);
      expect(jwCalls).toBe(config.retry.jwActivationMax + 1);
      expect(casCalls).toBe(0);
    } finally { clock.restore(); }
  });

  it('CAS 成功后激活失败只冷却缺失能力，到期复用 TGC 而不重新登录 CAS', async () => {
    const userId = await createUser('cooldown-activation', 'password');
    const clock = clockAtNow();
    let casCalls = 0;
    let jwCalls = 0;
    authBehavior.login = async () => { casCalls += 1; return { success: true, portalToken: 'portal-ok', steps: [] }; };
    ticketBehavior.exchangeJwSession = async () => { jwCalls += 1; throw schoolUnavailable(); };
    try {
      await expect(recovery.ensure(userId, 'jw_session', requestContext()))
        .rejects.toMatchObject({ code: 3005, httpStatus: 503 });
      expect((await recovery.ensure(userId, 'portal_jwt', requestContext()))?.value).toBe('portal-ok');
      await expect(recovery.ensure(userId, 'jw_session', requestContext()))
        .rejects.toMatchObject({ code: 3005, httpStatus: 503 });
      expect(jwCalls).toBe(1);
      clock.advance(5_000);
      ticketBehavior.exchangeJwSession = async () => { jwCalls += 1; return { success: true, steps: [] }; };
      expect(await recovery.ensure(userId, 'jw_session', requestContext())).not.toBeNull();
      expect(casCalls).toBe(1);
      expect(jwCalls).toBe(2);
    } finally { clock.restore(); }
  });

  it('验证码交互标记优先于旧瞬态冷却，不再返回旧上游异常', async () => {
    const userId = await createUser('cooldown-captcha-priority', 'password');
    authBehavior.getCaptcha = async () => { throw new Error('CAS_CAPTCHA_HTTP_503'); };
    await expect(recovery.ensure(userId, 'portal_jwt', requestContext())).rejects.toMatchObject({ code: 3005 });
    await schoolStateStore.markInteraction(userId, schoolStateStore.epoch(userId), 'captcha_required');
    await expect(recovery.ensure(userId, 'portal_jwt', requestContext())).rejects.toMatchObject({ code: 3003 });
    await expect(recovery.ensure(userId, 'cas_tgc', requestContext())).rejects.toMatchObject({ code: 3003 });
  });

  it('主动真实登录提交换代后立即脱离旧冷却，即使新凭证马上需要恢复', async () => {
    const userId = await createUser('cooldown-real-login', 'password');
    let calls = 0;
    authBehavior.login = async () => { calls += 1; return { success: false, steps: [] }; };
    await expect(recovery.ensure(userId, 'portal_jwt', requestContext())).rejects.toMatchObject({ code: 3005 });
    await realLogin('cooldown-real-login');
    await clearBaseCredentials(userId);
    authBehavior.login = async () => { calls += 1; return { success: true, portalToken: 'restored', steps: [] }; };
    expect((await recovery.ensure(userId, 'portal_jwt', requestContext()))?.value).toBe('restored');
    expect(calls).toBe(2);
  });

  it('新登录已有有效凭证时直接返回，不等待同能力旧恢复航班结束', async () => {
    const userId = await createUser('cooldown-new-credential', 'password');
    authBehavior.login = async () => {
      await realLogin('cooldown-new-credential');
      // 旧航班尚未返回时模拟下一次业务读取，必须命中新登录的凭证。
      expect((await recovery.ensure(userId, 'portal_jwt', requestContext()))?.value).toBe('new-login-portal');
      return { success: false, steps: [] };
    };
    expect((await recovery.ensure(userId, 'portal_jwt', requestContext()))?.value).toBe('new-login-portal');
  });

  it('旧 CAS 请求迟到失败、验证码或成功均不得覆盖新真实登录', async () => {
    for (const result of ['failure', 'captcha', 'success', 'exception'] as const) {
      const studentId = `cooldown-late-${result}`;
      const userId = await createUser(studentId, 'password');
      authBehavior.login = async () => {
        await realLogin(studentId);
        if (result === 'exception') throw new Error('CAS_LOGIN_HTTP_503');
        return { success: result === 'success', needCaptcha: result === 'captcha', portalToken: 'late-old-portal', steps: [] };
      };
      expect((await recovery.ensure(userId, 'portal_jwt', requestContext()))?.value).toBe('new-login-portal');
      expect(readSchoolLoginEpoch(getDb(), userId)).toBe(1);
      expect(await schoolStateStore.requiresInteraction(userId)).toBe(false);
      await clearBaseCredentials(userId);
      authBehavior.login = async () => ({ success: true, portalToken: 'next-portal', steps: [] });
      expect((await recovery.ensure(userId, 'portal_jwt', requestContext()))?.value).toBe('next-portal');
    }
  });

  it('旧 CAS 已成功但换票迟到时，提交与异常补偿均不得覆盖新登录', async () => {
    for (const fails of [false, true]) {
      const studentId = `cooldown-late-ticket-${fails}`;
      const userId = await createUser(studentId, 'password');
      authBehavior.login = async () => ({ success: true, portalToken: null, steps: [] });
      ticketBehavior.exchangePortalToken = async () => {
        await realLogin(studentId);
        if (fails) throw new Error('REQUEST_TIMEOUT');
        return { token: 'late-ticket', steps: [] };
      };
      expect((await recovery.ensure(userId, 'portal_jwt', requestContext()))?.value).toBe('new-login-portal');
      expect(readSchoolLoginEpoch(getDb(), userId)).toBe(2);
    }
  });
});

describe('CAS 安全读取在共享恢复内重试', () => {
  for (const phase of ['getCaptcha', 'getExecution'] as const) {
    it(`${phase} 瞬态失败后真正重试，并发调用只提交一次登录`, async () => {
      const userId = await createUser(`cas-read-retry-${phase}`, 'password');
      let reads = 0;
      let logins = 0;
      const original = authBehavior[phase];
      const read = async () => {
        reads += 1;
        if (reads === 1) throw new Error('REQUEST_TIMEOUT');
        return original();
      };
      if (phase === 'getCaptcha') authBehavior.getCaptcha = read as typeof authBehavior.getCaptcha;
      else authBehavior.getExecution = read as typeof authBehavior.getExecution;
      authBehavior.login = async () => {
        logins += 1;
        return { success: true, portalToken: 'recovered-after-read-retry', steps: [] };
      };
      const results = await Promise.all(Array.from({ length: 8 }, () =>
        recovery.ensure(userId, 'portal_jwt', requestContext(Date.now() + 10_000))));
      expect(results.every((result) => result?.value === 'recovered-after-read-retry')).toBe(true);
      expect(reads).toBe(2);
      expect(logins).toBe(1);
      expect(await schoolStateStore.requiresInteraction(userId)).toBe(false);
    });
  }

  it('读取重试耗尽才开始五秒冷却，冷却内请求不再访问 CAS', async () => {
    const userId = await createUser('cas-read-exhausted', 'password');
    const clock = clockAtNow();
    let reads = 0;
    const failure = new Error('CAS_CAPTCHA_HTTP_503');
    authBehavior.getCaptcha = async () => {
      reads += 1;
      clock.advance(1_000);
      throw failure;
    };
    try {
      await expect(recovery.ensure(userId, 'portal_jwt', requestContext())).rejects.toMatchObject({ code: 3005 });
      expect(reads).toBe(config.retry.businessMaxAttempts);
      clock.advance(4_999);
      await expect(recovery.ensure(userId, 'portal_jwt', requestContext())).rejects.toMatchObject({ code: 3005 });
      expect(reads).toBe(config.retry.businessMaxAttempts);
      clock.advance(1);
      authBehavior.getCaptcha = async () => { reads += 1; return new ArrayBuffer(0); };
      expect(await recovery.ensure(userId, 'portal_jwt', requestContext())).not.toBeNull();
      expect(reads).toBe(config.retry.businessMaxAttempts + 1);
    } finally { clock.restore(); }
  });

  it('短等待者到期不取消共享恢复，长等待者完成后才清理支架', async () => {
    const userId = await createUser('cas-read-deadline', 'password');
    let release!: () => void;
    let started!: () => void;
    const began = new Promise<void>(resolve => { started = resolve; });
    const blocked = new Promise<void>(resolve => { release = resolve; });
    authBehavior.getCaptcha = async () => { started(); await blocked; return new ArrayBuffer(0); };
    const short = recovery.ensure(userId, 'portal_jwt', requestContext(Date.now() + 20));
    const assertion = expect(short).rejects.toMatchObject({ code: 3004 });
    await began;
    const long = recovery.ensure(userId, 'portal_jwt', requestContext());
    try {
      await assertion;
      expect(schoolStateStore.read(userId, 'cas_tgc')).toBeNull();
    } finally { release(); await long; }
    expect(schoolStateStore.read(userId, 'portal_jwt')).not.toBeNull();
  });

  it('登录 POST 超时保持 3004，不因安全读取重试而再次提交', async () => {
    const userId = await createUser('cas-login-no-replay', 'password');
    let logins = 0;
    const failure = new Error('REQUEST_TIMEOUT');
    authBehavior.login = async () => { logins += 1; throw failure; };
    await expect(recovery.ensure(userId, 'portal_jwt', requestContext())).rejects.toMatchObject({ code: 3004 });
    await expect(recovery.ensure(userId, 'portal_jwt', requestContext())).rejects.toMatchObject({ code: 3004 });
    expect(logins).toBe(1);
  });
});
