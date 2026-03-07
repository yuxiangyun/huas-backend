import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { HttpClient } from '../core/http-client';
import { AuthEngine } from '../auth/auth-engine';
import { TicketExchanger } from '../auth/ticket-exchanger';
import { CredentialManager } from '../auth/credential-manager';
import { generateToken } from '../auth/jwt';
import { CryptoHelper } from '../utils/crypto';
import { UserParser } from '../parsers';
import { URLS } from '../core/url-config';
import { getDb, schema } from '../db';
import { config, PORTAL_HEADERS } from '../config';
import { Logger } from '../utils/logger';
import { success, error } from '../utils/response';
import { ErrorCode } from '../utils/errors';

const auth = new Hono();

// Temporary storage for captcha sessions (pre-login, no user yet)
const MAX_CAPTCHA_SESSIONS = 1000;
const captchaSessions = new Map<string, { jarJson: string; execution: string; createdAt: number }>();

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

  let client: HttpClient;
  let execution: string | null;

  if (sessionId) {
    const session = captchaSessions.get(sessionId);
    if (!session) {
      return error(c, ErrorCode.CAPTCHA_ERROR, '验证码会话不存在或已过期，请重新获取验证码', 400);
    }
    captchaSessions.delete(sessionId);
    if (!session.execution) {
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
      Logger.error('Auth', 'execution 获取失败', e);
      if (e.message === 'REQUEST_TIMEOUT') {
        return error(c, ErrorCode.UPSTREAM_TIMEOUT, '学校服务器超时', 504);
      }
      return error(c, ErrorCode.INTERNAL_ERROR, '登录服务异常', 500);
    }
  }

  if (!execution) {
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
          Logger.auth(username, '验证码获取失败', 400, loginMs, undefined, result.steps);
          return error(c, ErrorCode.CAPTCHA_ERROR, '需要验证码，但获取失败', 400);
        }
      }
      Logger.auth(username, result.message || '登录失败', 400, loginMs, undefined, result.steps);
      return error(c, ErrorCode.CAS_LOGIN_FAILED, result.message || '登录失败', 400);
    }

    // Login succeeded - activate JW session
    const jwResult = await TicketExchanger.exchangeJwSession(client);
    const allSteps = [...(result.steps || []), ...jwResult.steps];

    if (!jwResult.success) {
      Logger.auth(username, '教务系统激活失败', 200, loginMs, undefined, allSteps);
      return error(c, ErrorCode.CAS_LOGIN_FAILED, '教务系统激活失败', 400);
    }

    // Fetch user info
    let userName = '';
    let className = '';
    if (result.portalToken) {
      try {
        const userRes = await client.request(URLS.userInfo, {
          headers: {
            'X-Id-Token': result.portalToken,
            ...PORTAL_HEADERS,
          },
          timeout: config.timeout.business,
        });
        const userJson = await userRes.json() as any;
        const userInfo = UserParser.parse(userJson);
        if (userInfo) {
          userName = userInfo.name;
          className = userInfo.className;
        }
      } catch {
        // User info fetch failure doesn't block login
      }
    }

    // Upsert user in DB + store encrypted password for silent re-auth
    const db = getDb();
    const now = new Date();
    const encryptedPassword = CryptoHelper.encryptAES(password, config.jwtSecret);

    let existingUsers = await db.select()
      .from(schema.users)
      .where(eq(schema.users.studentId, username))
      .limit(1);

    let userId: number;
    if (existingUsers.length > 0) {
      userId = existingUsers[0].id;
      await db.update(schema.users)
        .set({
          name: userName || existingUsers[0].name,
          className: className || existingUsers[0].className,
          encryptedPassword,
          lastLoginAt: now,
        })
        .where(eq(schema.users.id, userId));
    } else {
      const inserted = await db.insert(schema.users).values({
        studentId: username,
        name: userName || null,
        className: className || null,
        encryptedPassword,
        createdAt: now,
        lastLoginAt: now,
      }).returning({ id: schema.users.id });
      userId = inserted[0].id;
    }

    const resolvedName = userName || existingUsers[0]?.name || undefined;

    // Store all credentials
    const jarJson = client.serializeJar();
    await CredentialManager.storeCredential(userId, 'cas_tgc', null, jarJson, config.ttl.tgc);
    if (result.portalToken) {
      await CredentialManager.storeCredential(userId, 'portal_jwt', result.portalToken, null, config.ttl.portalJwt);
    }
    await CredentialManager.storeCredential(userId, 'jw_session', null, jarJson, config.ttl.jwSession);

    // Generate our JWT
    const token = await generateToken({ userId, studentId: username, name: resolvedName });

    Logger.auth(username, '成功', 200, loginMs, resolvedName, allSteps);

    return success(c, { token, user: { name: resolvedName, studentId: username, className } });
  } catch (e: any) {
    Logger.error('Auth', '登录异常', e);
    if (e.message === 'REQUEST_TIMEOUT') {
      return error(c, ErrorCode.UPSTREAM_TIMEOUT, '学校服务器超时', 504);
    }
    return error(c, ErrorCode.INTERNAL_ERROR, '登录服务异常', 500);
  }
});

export default auth;
