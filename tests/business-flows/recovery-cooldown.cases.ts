/**
 * [INPUT]: 依赖业务流上游替身、可控时钟、真实 Identity 提交事务与 CredentialManager
 * [OUTPUT]: 验证五秒固定窗口、本地登录隔离、能力失败隔离、换票合流及新登录阻断迟到恢复
 * [POS]: tests/business-flows 的登录恢复事故回归，以调用次数和最终凭证事实证明兼容性
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { describe, expect, it, spyOn } from 'bun:test';
import { Hono, authRoutes, authBehavior, ticketBehavior, createUser, CredentialManager, getDb, CryptoHelper, config } from './harness';
import { SqliteIdentityStore } from '../../src/modules/identity/infrastructure/sqlite-identity.store';
import { readSchoolLoginEpoch } from '../../src/modules/campus-integrations/credential-recovery/school-login-context';

function clockAtNow() {
  let now = Date.now();
  const clock = spyOn(Date, 'now').mockImplementation(() => now);
  return { advance: (ms: number) => { now += ms; }, restore: () => clock.mockRestore() };
}

async function realLogin(studentId: string) {
  return new SqliteIdentityStore().commitRealSchoolLogin({
    studentId, encryptedPassword: CryptoHelper.encryptAES('password', config.jwtSecret), at: new Date(),
    credentials: { casCookieJar: '{"cookies":[]}', portalToken: 'new-login-portal', jwCookieJar: '{"cookies":[]}' },
  });
}

describe('五秒恢复冷却与真实登录隔离', () => {
  it('本地登录不访问上游；跨来源连续失败不续期，五秒到点并发只登录一次 CAS', async () => {
    const userId = await createUser('cooldown-local', 'local-password');
    const clock = clockAtNow();
    let calls = 0;
    authBehavior.login = async () => { calls += 1; return { success: false, steps: [] }; };
    try {
      expect(await CredentialManager.getOrRefreshPortalCredentialWithoutJw(userId)).toBeNull();
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
        expect(await CredentialManager.getOrRefreshCredential(userId, system)).toBeNull();
      }
      expect(calls).toBe(1);
      clock.advance(1);
      authBehavior.login = async () => { calls += 1; return { success: true, portalToken: 'recovered', steps: [] }; };
      const results = await Promise.all(Array.from({ length: 12 }, (_, index) => index % 2
        ? CredentialManager.getOrRefreshCredential(userId, 'jw_session')
        : CredentialManager.getOrRefreshPortalCredentialWithoutJw(userId)));
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
        expect(await CredentialManager.silentReAuth(userId)).toBe(false);
        expect(calls).toBe(round);
        clock.advance(4_999);
        expect(await CredentialManager.silentReAuth(userId)).toBe(false);
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
          await expect(CredentialManager.getOrRefreshPortalCredentialWithoutJw(userId)).rejects.toThrow('REQUEST_TIMEOUT');
        }
        expect(calls).toBe(1);
        expect(await CredentialManager.requiresInteractiveLogin(userId)).toBe(false);
        clock.advance(5_000);
        authBehavior.getExecution = async () => { calls += 1; return 'execution'; };
        expect(await CredentialManager.getOrRefreshPortalCredentialWithoutJw(userId)).not.toBeNull();
        expect(calls).toBe(2);
      } finally { clock.restore(); }
    }
  });

  it('JW 换票失败不阻断 Portal，五秒内保留超时语义，到期合并 JW 换票而不登录 CAS', async () => {
    const userId = await createUser('cooldown-jw', 'password');
    await CredentialManager.storeCredential(userId, 'cas_tgc', null, '{"cookies":[]}', 60_000);
    const clock = clockAtNow();
    let jwCalls = 0;
    let casCalls = 0;
    authBehavior.login = async () => { casCalls += 1; return { success: false, steps: [] }; };
    ticketBehavior.exchangeJwSession = async () => {
      jwCalls += 1;
      return { success: false, upstreamUnavailable: true, steps: [] };
    };
    try {
      await expect(CredentialManager.getOrRefreshCredential(userId, 'jw_session')).rejects.toThrow('REQUEST_TIMEOUT');
      expect(await CredentialManager.getOrRefreshPortalCredentialWithoutJw(userId)).not.toBeNull();
      clock.advance(4_999);
      await expect(CredentialManager.getOrRefreshCredential(userId, 'jw_session')).rejects.toThrow('REQUEST_TIMEOUT');
      expect(jwCalls).toBe(1);
      clock.advance(1);
      ticketBehavior.exchangeJwSession = async () => { jwCalls += 1; return { success: true, steps: [] }; };
      expect((await Promise.all(Array.from({ length: 10 }, () =>
        CredentialManager.getOrRefreshCredential(userId, 'jw_session')))).every(Boolean)).toBe(true);
      expect(jwCalls).toBe(2);
      expect(casCalls).toBe(0);
    } finally { clock.restore(); }
  });

  it('CAS 成功后激活失败只冷却缺失能力，到期复用 TGC 而不重新登录 CAS', async () => {
    const userId = await createUser('cooldown-activation', 'password');
    const clock = clockAtNow();
    let casCalls = 0;
    let jwCalls = 0;
    authBehavior.login = async () => { casCalls += 1; return { success: true, portalToken: 'portal-ok', steps: [] }; };
    ticketBehavior.exchangeJwSession = async () => { jwCalls += 1; return { success: false, steps: [] }; };
    try {
      expect(await CredentialManager.getOrRefreshCredential(userId, 'jw_session')).toBeNull();
      expect((await CredentialManager.getOrRefreshPortalCredentialWithoutJw(userId))?.value).toBe('portal-ok');
      expect(await CredentialManager.getOrRefreshCredential(userId, 'jw_session')).toBeNull();
      expect(jwCalls).toBe(1);
      clock.advance(5_000);
      ticketBehavior.exchangeJwSession = async () => { jwCalls += 1; return { success: true, steps: [] }; };
      expect(await CredentialManager.getOrRefreshCredential(userId, 'jw_session')).not.toBeNull();
      expect(casCalls).toBe(1);
      expect(jwCalls).toBe(2);
    } finally { clock.restore(); }
  });

  it('验证码交互标记优先于旧瞬态冷却，不再返回旧上游异常', async () => {
    const userId = await createUser('cooldown-captcha-priority', 'password');
    authBehavior.getCaptcha = async () => { throw new Error('CAS_CAPTCHA_HTTP_503'); };
    await expect(CredentialManager.getOrRefreshPortalCredentialWithoutJw(userId)).rejects.toThrow('CAS_CAPTCHA_HTTP_503');
    await CredentialManager.markInteractiveLoginRequired(userId);
    expect(await CredentialManager.getOrRefreshPortalCredentialWithoutJw(userId)).toBeNull();
    expect(await CredentialManager.silentReAuth(userId, undefined, 'portal_jwt')).toBe(false);
  });

  it('主动真实登录提交换代后立即脱离旧冷却，即使新凭证马上需要恢复', async () => {
    const userId = await createUser('cooldown-real-login', 'password');
    let calls = 0;
    authBehavior.login = async () => { calls += 1; return { success: false, steps: [] }; };
    expect(await CredentialManager.getOrRefreshPortalCredentialWithoutJw(userId)).toBeNull();
    await realLogin('cooldown-real-login');
    await CredentialManager.invalidateAll(userId);
    authBehavior.login = async () => { calls += 1; return { success: true, portalToken: 'restored', steps: [] }; };
    expect((await CredentialManager.getOrRefreshPortalCredentialWithoutJw(userId))?.value).toBe('restored');
    expect(calls).toBe(2);
  });

  it('新登录已有有效凭证时直接返回，不等待同能力旧恢复航班结束', async () => {
    const userId = await createUser('cooldown-new-credential', 'password');
    authBehavior.login = async () => {
      await realLogin('cooldown-new-credential');
      // 旧航班尚未返回时模拟下一次业务读取，必须命中新登录的凭证。
      expect((await CredentialManager.getOrRefreshPortalCredentialWithoutJw(userId))?.value).toBe('new-login-portal');
      return { success: false, steps: [] };
    };
    expect((await CredentialManager.getOrRefreshPortalCredentialWithoutJw(userId))?.value).toBe('new-login-portal');
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
      expect((await CredentialManager.getOrRefreshPortalCredentialWithoutJw(userId))?.value).toBe('new-login-portal');
      expect(readSchoolLoginEpoch(getDb(), userId)).toBe(1);
      expect(await CredentialManager.requiresInteractiveLogin(userId)).toBe(false);
      await CredentialManager.invalidateAll(userId);
      authBehavior.login = async () => ({ success: true, portalToken: 'next-portal', steps: [] });
      expect((await CredentialManager.getOrRefreshPortalCredentialWithoutJw(userId))?.value).toBe('next-portal');
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
      expect((await CredentialManager.getOrRefreshPortalCredentialWithoutJw(userId))?.value).toBe('new-login-portal');
      expect(readSchoolLoginEpoch(getDb(), userId)).toBe(1);
    }
  });
});
