/**
 * [INPUT]: 依赖 SchoolRequestExecutor、SchoolRecovery、SchoolStateStore、单次 CAS 协议与隔离 SQLite
 * [OUTPUT]: 验证有限重试、独立等待、快照条件失效、单次换票及明确认证拒绝语义
 * [POS]: tests 的 SchoolAccess 调度和基础凭证护栏；不重建已删除的任意上游回调接口
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */
import { beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { generateKeyPairSync } from 'node:crypto';
import { getDb, schema } from '../src/db';
import { runtimeConfig } from '../src/runtime-config';
import { HttpClient } from '../src/modules/campus-integrations/http/http-client';
import { TicketExchanger } from '../src/modules/campus-integrations/cas/ticket-exchanger';
import { AuthEngine } from '../src/modules/campus-integrations/cas/auth-engine';
import { SchoolRequestExecutor, SharedSchoolFlights, type SchoolRequestContext } from '../src/modules/campus-integrations/school-access/request-executor';
import { SchoolRecovery } from '../src/modules/campus-integrations/school-access/recovery';
import { schoolStateStore } from '../src/modules/campus-integrations/school-access/state-store';
import { commitRealSchoolLoginContext, upsertBaseCredential } from '../src/modules/campus-integrations/school-access/school-login-context';
import { sessionRejected } from '../src/modules/campus-integrations/school-access/errors';
import { AppError, ErrorCode } from '../src/utils/errors';
import { clearSocialTestData } from './social-database';

const EMPTY_JAR_JSON = new HttpClient().serializeJar();
const executor = new SchoolRequestExecutor();
function context(budget = 5_000, delay = 0): SchoolRequestContext {
  return { deadlineAt: Date.now() + budget, config: {
    ...runtimeConfig, retry: { ...runtimeConfig.retry, businessMaxAttempts: 2,
      businessBaseDelayMs: delay, businessMaxDelayMs: delay, businessJitterMs: 0 },
  } };
}
let userId = 0;
beforeEach(async () => {
  await clearSocialTestData(getDb());
  userId = getDb().insert(schema.users).values({ studentId: '2023999001', name: 'retry-test',
    className: 'test', encryptedPassword: null, createdAt: new Date(), lastLoginAt: new Date(),
  }).returning({ id: schema.users.id }).get()!.id;
  upsertBaseCredential(getDb(), { userId, system: 'jw_session', value: null, cookieJar: EMPTY_JAR_JSON, at: new Date() });
});

describe('SchoolAccess 调度与快照失效', () => {
  for (const system of ['portal_jwt', 'jw_session'] as const) {
    for (const change of ['login', 'rotation'] as const) {
      it(`${system} 迟到拒绝不删除 ${change} 后凭证，重放复用新快照`, async () => {
        upsertBaseCredential(getDb(), { userId, system, value: system === 'portal_jwt' ? 'old' : null,
          cookieJar: system === 'jw_session' ? EMPTY_JAR_JSON : null, at: new Date() });
        let release!: () => void;
        let enter!: () => void;
        const blocked = new Promise<void>(resolve => { release = resolve; });
        const started = new Promise<void>(resolve => { enter = resolve; });
        const recovery = new SchoolRecovery();
        const request = context();
        let calls = 0;
        const invalidations: boolean[] = [];
        const pending = executor.operation(request, {
          resolve: () => recovery.ensure(userId, system, request),
          invalidate: snapshot => { invalidations.push(schoolStateStore.invalidate(snapshot)); },
          run: async snapshot => {
            if (++calls === 1) { enter(); await blocked; throw sessionRejected(); }
            return snapshot;
          }, replayable: true,
        });
        const result = pending.then(value => ({ value }), error => ({ error }));
        await started;
        getDb().transaction(tx => {
          if (change === 'login') commitRealSchoolLoginContext(tx, {
            userId, casCookieJar: EMPTY_JAR_JSON, portalToken: 'fresh', at: new Date(),
          });
          upsertBaseCredential(tx, { userId, system, value: system === 'portal_jwt' ? 'fresh' : null,
            cookieJar: system === 'jw_session' ? EMPTY_JAR_JSON : null, at: new Date(Date.now() + 1_000) });
        });
        release();
        const resolved = await result;
        expect('error' in resolved).toBe(false);
        if ('value' in resolved) expect(resolved.value).toEqual(schoolStateStore.read(userId, system)!);
        expect(calls).toBe(2);
        expect(invalidations).toEqual([false]);
      });
    }
  }

  it('同值凭证仍受 epoch 隔离，当前快照仅失效一次', () => {
    upsertBaseCredential(getDb(), { userId, system: 'portal_jwt', value: 'same', cookieJar: null, at: new Date() });
    const old = schoolStateStore.read(userId, 'portal_jwt')!;
    getDb().transaction(tx => commitRealSchoolLoginContext(tx, { userId, casCookieJar: EMPTY_JAR_JSON, portalToken: 'same', at: new Date() }));
    expect(schoolStateStore.invalidate(old)).toBe(false);
    const current = schoolStateStore.read(userId, 'portal_jwt')!;
    expect(schoolStateStore.invalidate(current)).toBe(true);
    expect(schoolStateStore.invalidate(current)).toBe(false);
    expect(schoolStateStore.read(userId, 'portal_jwt')).toBeNull();
  });

  it('临时超时只重试读取，不触发凭证删除', async () => {
    const snapshot = schoolStateStore.read(userId, 'jw_session');
    let calls = 0;
    const result = await executor.step(context(), async () => {
      if (++calls === 1) throw new Error('REQUEST_TIMEOUT');
      return 'ok';
    });
    expect(result).toBe('ok');
    expect(calls).toBe(2);
    expect(schoolStateStore.read(userId, 'jw_session')).toEqual(snapshot);
  });

  it('解析失败归一化为协议错误且不重试', async () => {
    let calls = 0;
    await expect(executor.step(context(), async () => { calls++; throw new Error('PARSER_FAILED'); }))
      .rejects.toMatchObject({ kind: 'protocol', code: 3005 });
    expect(calls).toBe(1);
  });

  it('目标换票瞬态失败由唯一执行器重试，成功后条件提交', async () => {
    upsertBaseCredential(getDb(), { userId, system: 'cas_tgc', value: null, cookieJar: EMPTY_JAR_JSON, at: new Date() });
    let calls = 0;
    const exchange = spyOn(TicketExchanger, 'exchangePortalToken').mockImplementation(async () => {
      if (++calls === 1) throw new Error('REQUEST_TIMEOUT');
      return { token: 'fresh', steps: [] };
    });
    try {
      const result = await new SchoolRecovery().ensure(userId, 'portal_jwt', context());
      expect(result.value).toBe('fresh');
      expect(calls).toBe(2);
      expect(schoolStateStore.read(userId, 'portal_jwt')).toEqual(result);
    } finally { exchange.mockRestore(); }
  });

  it('deadline 无法容纳退避时不再启动尝试', async () => {
    let calls = 0;
    await expect(executor.step(context(50, 100), async () => { calls++; throw new Error('REQUEST_TIMEOUT'); }))
      .rejects.toMatchObject({ kind: 'timeout', code: 3004 });
    expect(calls).toBe(1);
  });

  it('成绩 502/503/504 与无效页依照统一错误事实有限重试', async () => {
    for (const message of ['GRADE_HTTP_502', 'GRADE_HTTP_503', 'GRADE_HTTP_504', 'GRADE_PAGE_INVALID']) {
      let calls = 0;
      await expect(executor.step(context(), async () => { calls++; throw new Error(message); }))
        .rejects.toMatchObject({ kind: 'unavailable', retryable: true });
      expect(calls).toBe(2);
    }
  });

  it('3003 与评教门禁不可重试', async () => {
    for (const code of [ErrorCode.CREDENTIAL_EXPIRED, ErrorCode.EVALUATION_REQUIRED]) {
      let calls = 0;
      await expect(executor.step(context(), async () => { calls++; throw new AppError(code, 'blocked'); }, true, 3))
        .rejects.toMatchObject({ code });
      expect(calls).toBe(1);
    }
  });

  it('二次会话拒绝只恢复一次并报告 3005，写请求不重放', async () => {
    for (const replayable of [true, false]) {
      let resolves = 0;
      let runs = 0;
      let invalidates = 0;
      await expect(executor.operation(context(), {
        resolve: async () => ++resolves,
        run: async () => { runs++; throw sessionRejected(); },
        invalidate: () => { invalidates++; }, replayable,
      })).rejects.toMatchObject({ code: 3005 });
      expect(resolves).toBe(replayable ? 2 : 1);
      expect(runs).toBe(replayable ? 2 : 1);
      expect(invalidates).toBe(runs);
    }
  });

  it('共享恢复独立等待：短等待超时不取消长等待或共享结果', async () => {
    const flights = new SharedSchoolFlights();
    let release!: (value: string) => void;
    let calls = 0;
    const work = async (shared: SchoolRequestContext) => {
      calls++;
      expect(shared.deadlineAt).toBeGreaterThan(Date.now() + 1_000);
      return new Promise<string>(resolve => { release = resolve; });
    };
    const short = flights.run('same', context(20), work);
    const rejected = expect(short).rejects.toMatchObject({ code: 3004 });
    const long = flights.run('same', context(), work);
    await rejected;
    release('done');
    expect(await long).toBe('done');
    expect(calls).toBe(1);
  });
});

describe('auth upstream failure semantics', () => {
  it('JW 换票最终落到 HTTP 200 登录页时不得报告激活成功', async () => {
    const loginPage = `<html><head><title>登录</title></head><body>${'x'.repeat(900)}<form action="/jsxsd/xk/LoginToXk"><input name="RANDOMCODE"></form></body></html>`;
    let requestCount = 0;
    const client = {
      getRemainingTimeMs: () => 10_000,
      request: async () => {
        requestCount += 1;
        return requestCount % 2 === 1
          ? new Response(null, { status: 302, headers: { location: 'https://xyjw.huas.edu.cn/sso-step' } })
          : new Response(loginPage, { status: 200 });
      },
      followRedirects: async () => ({ success: true, finalStatus: 200 }),
    } as unknown as HttpClient;

    await expect(TicketExchanger.exchangeJwSession(client)).rejects.toMatchObject({ kind: 'unavailable', code: 3005, retryable: false });
    expect(requestCount).toBe(2);
  });

  it('JW 换票只有读到已登录主框架后才报告激活成功', async () => {
    let requestCount = 0;
    const client = {
      getRemainingTimeMs: () => 10_000,
      request: async () => {
        requestCount += 1;
        return requestCount === 1
          ? new Response(null, { status: 302, headers: { location: 'https://xyjw.huas.edu.cn/sso-step' } })
          : new Response('<html><title>教学一体化服务平台</title><button id="btn_userLogout">退出系统</button><main id="mainContentPanle"></main></html>');
      },
      followRedirects: async () => ({ success: true, finalStatus: 200 }),
    } as unknown as HttpClient;

    await expect(TicketExchanger.exchangeJwSession(client)).resolves.toMatchObject({
      success: true,
      steps: [{ ok: true }],
    });
  });

  it('Portal 换票 REQUEST_TIMEOUT 原样透传', async () => {
    const client = {
      request: async () => { throw new Error('REQUEST_TIMEOUT'); },
    } as unknown as HttpClient;

    await expect(TicketExchanger.exchangePortalToken(client)).rejects.toThrow('REQUEST_TIMEOUT');
  });

  it('Portal 换票直接 5xx 与嵌套连接故障不退化为缺少 ticket', async () => {
    for (const status of [500, 502, 503, 504]) {
      const client = { request: async () => new Response('unavailable', { status }) } as unknown as HttpClient;
      await expect(TicketExchanger.exchangePortalToken(client)).rejects.toMatchObject({ kind: 'unavailable', code: 3005, retryable: true });
    }
    const failure = new Error('request failed', { cause: { code: 'ECONNREFUSED' } });
    const client = { request: async () => { throw failure; } } as unknown as HttpClient;
    await expect(TicketExchanger.exchangePortalToken(client)).rejects.toBe(failure);
  });

  it('JW 直接 5xx、重定向 5xx 与嵌套连接故障均保留上游不可用证据', async () => {

    for (const failure of ['direct', 'redirect', 'network'] as const) {
      let requests = 0;
      const client = {
        // 剩余预算充足，仅执行一次换票以单独证明故障分类。
        getRemainingTimeMs: () => 10_000,
        request: async () => {
          requests += 1;
          if (failure === 'network') throw new Error('request failed', { cause: { code: 'ECONNREFUSED' } });
          return failure === 'direct'
            ? new Response('unavailable', { status: 503 })
            : new Response(null, { status: 302, headers: { location: 'https://xyjw.huas.edu.cn/sso-step' } });
        },
        followRedirects: async () => ({ success: false, finalStatus: 503 }),
      } as unknown as HttpClient;
      if (failure === 'network') {
        await expect(TicketExchanger.exchangeJwSession(client)).rejects.toThrow('request failed');
      } else {
        await expect(TicketExchanger.exchangeJwSession(client)).rejects.toMatchObject({ kind: 'unavailable', retryable: true });
      }
      expect(requests).toBe(1);
    }
  });

  it('Portal 换票透传 fetch/解析器已识别的全部瞬态网络错误', async () => {
    const transientErrors = [
      'fetch failed',
      'read ECONNRESET',
      'getaddrinfo EAI_AGAIN xyjw.huas.edu.cn',
      'connect ETIMEDOUT',
      'getaddrinfo ENOTFOUND xyjw.huas.edu.cn',
      'network socket disconnected',
    ];

    for (const message of transientErrors) {
      const client = {
        request: async () => { throw new Error(message); },
      } as unknown as HttpClient;

      await expect(TicketExchanger.exchangePortalToken(client)).rejects.toThrow(message);
    }
  });

  it('CAS execution HTTP 5xx 与 200 维护页都不会返回空 execution', async () => {
    const httpFailure = new AuthEngine({
      request: async () => new Response('unavailable', { status: 503 }),
    } as unknown as HttpClient);
    await expect(httpFailure.getExecution()).rejects.toThrow('CAS_EXECUTION_HTTP_503');

    const maintenance = new AuthEngine({
      request: async () => new Response('<html><body>系统维护，请稍后再试</body></html>', { status: 200 }),
    } as unknown as HttpClient);
    await expect(maintenance.getExecution()).rejects.toThrow('CAS_MAINTENANCE');
  });

  it('CAS 登录阶段 HTTP 5xx 不会被解释为密码错误', async () => {
    const engine = new AuthEngine({
      request: async () => new Response('unavailable', { status: 502 }),
    } as unknown as HttpClient);

    await expect(engine.login('2023001001', 'password', '', 'execution'))
      .rejects.toThrow('CAS_PUBKEY_HTTP_502');
  });

  it('CAS 登录提交以 HTTP 401 拒绝错误密码时忽略页面静态验证码文案', async () => {
    const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 1024 });
    let requestCount = 0;
    const engine = new AuthEngine({
      request: async () => {
        requestCount += 1;
        if (requestCount === 1) {
          return new Response(publicKey.export({ type: 'spki', format: 'pem' }), { status: 200 });
        }
        return new Response(`
          <div id="loginError1">用户名或密码错误</div>
          <script>
            var currentMenu = "1";
            var hasErrors = true;
            var errors = ["用户名或密码错误"];
            var unusedCaptchaMessage = "验证码错误";
          </script>
        `, {
          status: 401,
        });
      },
    } as unknown as HttpClient);

    await expect(engine.login('2023001001', 'wrong-password', '', 'execution')).resolves.toEqual({
      success: false,
      needCaptcha: false,
      message: '账号或密码错误',
      credentialsRejected: true,
      steps: [],
    });
  });

  it('CAS 登录提交只根据结构化错误区域识别验证码错误并给出可操作提示', async () => {
    const { publicKey } = generateKeyPairSync('rsa', { modulusLength: 1024 });
    let requestCount = 0;
    const engine = new AuthEngine({
      request: async () => {
        requestCount += 1;
        if (requestCount === 1) {
          return new Response(publicKey.export({ type: 'spki', format: 'pem' }), { status: 200 });
        }
        return new Response(`
          <script>
            var currentMenu = "1";
            var hasErrors = true;
            var errors = ["验证码错误"];
          </script>
        `, { status: 401 });
      },
    } as unknown as HttpClient);

    await expect(engine.login('2023001001', 'password', 'AB12', 'execution')).resolves.toEqual({
      success: false,
      needCaptcha: true,
      message: '验证码错误，请重新输入',
      steps: [],
    });
  });
});
