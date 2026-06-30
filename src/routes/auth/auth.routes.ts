/**
 * [INPUT]: 依赖 AuthEngine/TicketExchanger/CredentialManager、db/schema、JWT、CryptoHelper 与 Portal UserService
 * [OUTPUT]: 对外默认导出 auth Hono 路由，提供 /auth/login 登录与验证码重试接口
 * [POS]: routes/auth 的登录入口，收敛本地快捷登录、CAS 验证码、上游凭证交换与本服务 JWT 签发
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { Hono } from 'hono';
import type { Context } from 'hono';
import { eq } from 'drizzle-orm';
import { timingSafeEqual } from 'node:crypto';
import { HttpClient } from '../../core/http-client';
import { AuthEngine } from '../../auth/auth-engine';
import { TicketExchanger } from '../../auth/ticket-exchanger';
import { CredentialManager } from '../../auth/credential-manager';
import { generateToken } from '../../auth/jwt';
import { CryptoHelper } from '../../utils/crypto';
import { getDb, schema } from '../../db';
import { config } from '../../config';
import { appendHttpLogDetail, formatHttpLogDetail } from '../../utils/http-log';
import { Logger } from '../../utils/logger';
import { success, error } from '../../utils/response';
import { ErrorCode } from '../../utils/errors';
import { UserService } from '../../services/portal/user-service';
import {
  buildAuthLoginRateLimitKey,
  getAuthLoginClientIp,
  getAuthLoginRateLimitStatus,
  recordAuthLoginFailure,
  resetAuthLoginRateLimit,
} from '../../middleware/auth-login-rate-limit.middleware';

const auth = new Hono();

// Temporary storage for captcha sessions (pre-login, no user yet)
const MAX_CAPTCHA_SESSIONS = 1000;
const captchaSessions = new Map<string, { jarJson: string; execution: string; createdAt: number }>();

function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, 'utf8');
  const bBuf = Buffer.from(b, 'utf8');
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

function recordLoginFailure(c: Context, key: string) {
  const status = recordAuthLoginFailure(key);
  appendHttpLogDetail(c, formatHttpLogDetail({
    loginFailures: status.failureCount,
    loginLimited: status.limited,
    retryAfterSeconds: status.retryAfterSeconds || undefined,
  }));
  return status;
}

// Cleanup old captcha sessions every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of captchaSessions) {
    if (now - session.createdAt > config.captchaSessionTtl) {
      captchaSessions.delete(id);
    }
  }
}, config.captchaSessionTtl);

auth.post('/login', async (c) => {
  let body: any;
  try {
    body = await c.req.json();
  } catch {
    return error(c, ErrorCode.PARAM_ERROR, '请求体必须是有效的 JSON', 400);
  }

  const { username, password, captcha, sessionId } = body;

  if (!username || !password) {
    return error(c, ErrorCode.PARAM_ERROR, '用户名和密码不能为空', 400);
  }

  const clientIp = getAuthLoginClientIp(c);
  const rateLimitKey = buildAuthLoginRateLimitKey(username, clientIp);
  const rateLimitStatus = getAuthLoginRateLimitStatus(rateLimitKey);
  if (rateLimitStatus.limited) {
    c.header('Retry-After', String(rateLimitStatus.retryAfterSeconds));
    appendHttpLogDetail(c, formatHttpLogDetail({
      username,
      clientIp: clientIp || undefined,
      result: 'rate-limited',
      retryAfterSeconds: rateLimitStatus.retryAfterSeconds,
    }));
    return error(c, ErrorCode.TOO_MANY_REQUESTS, '登录失败次数过多，请稍后再试', 429, {
      retryAfterSeconds: rateLimitStatus.retryAfterSeconds,
    });
  }

  appendHttpLogDetail(c, formatHttpLogDetail({
    username,
    loginMode: sessionId ? 'captcha' : 'password',
    hasCaptcha: Boolean(captcha),
    clientIp: clientIp || undefined,
  }));

  const db = getDb();

  if (!sessionId) {
    const users = await db.select({
      id: schema.users.id,
      name: schema.users.name,
      className: schema.users.className,
      encryptedPassword: schema.users.encryptedPassword,
    })
      .from(schema.users)
      .where(eq(schema.users.studentId, username))
      .limit(1);

    const existingUser = users[0];
    const requiresInteractiveLogin = existingUser
      ? CredentialManager.requiresInteractiveLogin(existingUser.id)
      : false;

    if (requiresInteractiveLogin) {
      appendHttpLogDetail(c, 'localShortcut=disabled-need-captcha');
    }

    if (!requiresInteractiveLogin && existingUser?.encryptedPassword) {
      const storedPassword = CryptoHelper.decryptAES(existingUser.encryptedPassword, config.jwtSecret);
      if (storedPassword && safeEqual(storedPassword, password)) {
        const now = new Date();
        await db.update(schema.users)
          .set({
            lastLoginAt: now,
            lastActiveAt: now,
          })
          .where(eq(schema.users.id, existingUser.id));

        const resolvedName = existingUser.name?.trim() || undefined;
        const resolvedClassName = existingUser.className?.trim() || '';
        const token = await generateToken({ userId: existingUser.id, studentId: username, name: resolvedName });

        Logger.auth(username, '本地登录成功', 200, 0, resolvedName, [
          { label: 'local', ok: true },
        ]);
        appendHttpLogDetail(c, 'result=local-success');
        resetAuthLoginRateLimit(rateLimitKey);

        return success(c, {
          token,
          user: { name: resolvedName, studentId: username, className: resolvedClassName },
        });
      }
    }
  }

  let client: HttpClient;
  let execution: string | null;

  if (sessionId) {
    const session = captchaSessions.get(sessionId);
    if (!session) {
      appendHttpLogDetail(c, 'result=captcha-session-missing');
      recordLoginFailure(c, rateLimitKey);
      return error(c, ErrorCode.CAPTCHA_ERROR, '验证码会话不存在或已过期，请重新获取验证码', 400);
    }
    captchaSessions.delete(sessionId);
    if (!session.execution) {
      appendHttpLogDetail(c, 'result=captcha-session-invalid');
      recordLoginFailure(c, rateLimitKey);
      return error(c, ErrorCode.CAPTCHA_ERROR, '验证码会话已失效，请重新获取验证码', 400);
    }

    // Retry with captcha — restore previous session
    client = HttpClient.fromSerializedJar(session.jarJson);
    client.setTimeout(config.timeout.cas);
    execution = session.execution;
  } else {
    // First attempt — fresh client, get execution
    client = new HttpClient(undefined, config.timeout.cas);
    const engine = new AuthEngine(client);

    try {
      execution = await engine.getExecution();
    } catch (e: any) {
      appendHttpLogDetail(c, 'result=execution-fetch-failed');
      Logger.error('Auth', 'execution 获取失败', e);
      if (e.message === 'REQUEST_TIMEOUT') {
        return error(c, ErrorCode.UPSTREAM_TIMEOUT, '学校服务器超时', 504);
      }
      return error(c, ErrorCode.INTERNAL_ERROR, '登录服务异常', 500);
    }
  }

  if (!execution) {
    appendHttpLogDetail(c, 'result=missing-execution');
    recordLoginFailure(c, rateLimitKey);
    return error(c, ErrorCode.CAS_LOGIN_FAILED, '无法获取登录凭据', 400);
  }

  const engine = new AuthEngine(client);

  try {
    const loginStart = Date.now();

    const result = await engine.login(username, password, captcha || '', execution);
    const loginMs = Date.now() - loginStart;

    if (!result.success) {
      if (result.needCaptcha) {
        // CAS requires captcha — fetch one and return it inline
        try {
          const buffer = await engine.getCaptcha();
          const newExecution = await engine.getExecution();
          if (!newExecution) {
            appendHttpLogDetail(c, 'result=captcha-session-init-failed');
            recordLoginFailure(c, rateLimitKey);
            Logger.auth(username, '验证码会话初始化失败', 400, loginMs, undefined, result.steps);
            return error(c, ErrorCode.CAPTCHA_ERROR, '需要验证码，但验证码会话初始化失败，请重试', 400);
          }
          const newSessionId = crypto.randomUUID();

          if (captchaSessions.size >= MAX_CAPTCHA_SESSIONS) {
            const oldest = captchaSessions.keys().next().value;
            if (oldest) captchaSessions.delete(oldest);
          }

          captchaSessions.set(newSessionId, {
            jarJson: client.serializeJar(),
            execution: newExecution,
            createdAt: Date.now(),
          });

          appendHttpLogDetail(c, 'result=captcha-required');
          recordLoginFailure(c, rateLimitKey);
          Logger.auth(username, '需要验证码', 400, loginMs, undefined, result.steps);
          return c.json({
            success: false,
            error_code: ErrorCode.CAPTCHA_ERROR,
            error_message: '需要验证码',
            needCaptcha: true,
            sessionId: newSessionId,
            captchaImage: Buffer.from(buffer).toString('base64'),
          }, 400);
        } catch {
          appendHttpLogDetail(c, 'result=captcha-fetch-failed');
          recordLoginFailure(c, rateLimitKey);
          Logger.auth(username, '验证码获取失败', 400, loginMs, undefined, result.steps);
          return error(c, ErrorCode.CAPTCHA_ERROR, '需要验证码，但获取失败', 400);
        }
      }
      appendHttpLogDetail(c, 'result=cas-failed');
      recordLoginFailure(c, rateLimitKey);
      Logger.auth(username, result.message || '登录失败', 400, loginMs, undefined, result.steps);
      return error(c, ErrorCode.CAS_LOGIN_FAILED, result.message || '登录失败', 400);
    }

    let portalToken = result.portalToken || null;
    let loginSteps = [...(result.steps || [])];

    if (!portalToken) {
      const portalResult = await TicketExchanger.exchangePortalToken(client);
      loginSteps = [...loginSteps, ...portalResult.steps];
      if (portalResult.token) {
        portalToken = portalResult.token;
      }
    }

    // Login succeeded - activate JW session if possible.
    const jwResult = await TicketExchanger.exchangeJwSession(client);
    const allSteps = [...loginSteps, ...jwResult.steps];

    if (!portalToken && !jwResult.success) {
      appendHttpLogDetail(c, 'result=school-activation-failed');
      recordLoginFailure(c, rateLimitKey);
      Logger.auth(username, '学校系统激活失败', 400, loginMs, undefined, allSteps);
      return error(c, ErrorCode.CAS_LOGIN_FAILED, '学校系统激活失败', 400);
    }

    // Upsert user in DB + store encrypted password for silent re-auth.
    // Profile fields are backfilled after credentials are persisted.
    const now = new Date();
    const encryptedPassword = CryptoHelper.encryptAES(password, config.jwtSecret);

    await db.insert(schema.users).values({
      studentId: username,
      name: null,
      className: null,
      encryptedPassword,
      createdAt: now,
      lastLoginAt: now,
      lastActiveAt: now,
    }).onConflictDoUpdate({
      target: schema.users.studentId,
      set: {
        encryptedPassword,
        lastLoginAt: now,
        lastActiveAt: now,
      },
    });

    const users = await db.select({
      id: schema.users.id,
      name: schema.users.name,
      className: schema.users.className,
    })
      .from(schema.users)
      .where(eq(schema.users.studentId, username))
      .limit(1);

    if (users.length === 0) {
      throw new Error('USER_UPSERT_FAILED');
    }

    const userId = users[0].id;
    let resolvedName = users[0].name || undefined;
    let resolvedClassName = users[0].className || '';

    // Store credentials that are already valid after CAS login.
    const jarJson = client.serializeJar();
    await CredentialManager.storeCredential(userId, 'cas_tgc', null, jarJson, config.ttl.tgc);
    if (portalToken) {
      await CredentialManager.storeCredential(userId, 'portal_jwt', portalToken, null, config.ttl.portalJwt);
    }
    if (jwResult.success) {
      await CredentialManager.storeCredential(userId, 'jw_session', null, jarJson, config.ttl.jwSession);
    }

    CredentialManager.clearLoginRecoveryState(userId);

    if (portalToken && (!resolvedName || !resolvedClassName)) {
      try {
        const profile = await UserService.getUserInfo(userId, username, true);
        if (profile.data?.name?.trim()) {
          resolvedName = profile.data.name.trim();
        }
        if (profile.data?.className?.trim()) {
          resolvedClassName = profile.data.className.trim();
        }
      } catch (profileError: any) {
        Logger.warn(
          'Auth',
          '用户信息获取失败，继续登录',
          profileError?.message || String(profileError),
          username
        );
      }
    }

    // Generate our JWT
    const token = await generateToken({ userId, studentId: username, name: resolvedName });

    appendHttpLogDetail(c, formatHttpLogDetail({
      result: jwResult.success ? 'success' : 'success-portal-only',
      userId,
    }));
    Logger.auth(
      username,
      jwResult.success ? '成功' : '成功（仅门户）',
      200,
      loginMs,
      resolvedName,
      allSteps
    );
    resetAuthLoginRateLimit(rateLimitKey);

    return success(c, {
      token,
      user: { name: resolvedName, studentId: username, className: resolvedClassName },
    });
  } catch (e: any) {
    appendHttpLogDetail(c, formatHttpLogDetail({
      result: e.message === 'REQUEST_TIMEOUT' ? 'upstream-timeout' : 'exception',
    }));
    Logger.error('Auth', '登录异常', e);
    if (e.message === 'REQUEST_TIMEOUT') {
      return error(c, ErrorCode.UPSTREAM_TIMEOUT, '学校服务器超时', 504);
    }
    return error(c, ErrorCode.INTERNAL_ERROR, '登录服务异常', 500);
  }
});

export default auth;
