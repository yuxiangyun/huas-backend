/**
 * [INPUT]: 依赖 Hono、LoginApplicationService 生产装配、登录 DTO、登录限流与统一响应/日志/analytics 边界
 * [OUTPUT]: 对外默认提供 `/login` Hono 路由，保持旧登录、验证码与错误响应契约
 * [POS]: identity/http 的薄适配器，只解析/校验 HTTP、挂载限流与观测，并映射应用结果
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { Hono } from 'hono';
import type { Context } from 'hono';
import {
  buildAuthLoginRateLimitKey,
  getAuthLoginClientIp,
  getAuthLoginRateLimitStatus,
  recordAuthLoginFailure,
  resetAuthLoginRateLimit,
} from '../../../middleware/auth-login-rate-limit.middleware';
import { AnalyticsService } from '../../../services/admin/analytics-service';
import { ErrorCode } from '../../../utils/errors';
import { appendHttpLogDetail, formatHttpLogDetail } from '../../../utils/http-log';
import { Logger } from '../../../utils/logger';
import { error, success } from '../../../utils/response';
import type { LoginFailure, LoginSuccess } from '../domain/login';
import { createScheduledLoginApplicationService } from '../infrastructure/login-composition';
import { parseLoginRequestDto } from './login.dto';

const auth = new Hono();
const loginService = createScheduledLoginApplicationService();

auth.use('/login', async (c, next) => {
  await next();
  try {
    AnalyticsService.recordLogin(c.req.header('x-client-platform'), c.res.status < 400);
  } catch (analyticsError: any) {
    Logger.warn('Analytics', '记录登录指标失败', analyticsError?.message || String(analyticsError));
  }
});

function recordFailure(c: Context, key: string) {
  const status = recordAuthLoginFailure(key);
  appendHttpLogDetail(c, formatHttpLogDetail({
    loginFailures: status.failureCount,
    loginLimited: status.limited,
    retryAfterSeconds: status.retryAfterSeconds || undefined,
  }));
}

function respondWithSuccess(c: Context, username: string, rateLimitKey: string, outcome: LoginSuccess) {
  const local = outcome.mode === 'local';
  appendHttpLogDetail(c, local
    ? 'result=local-success'
    : formatHttpLogDetail({ result: outcome.mode === 'portal-only' ? 'success-portal-only' : 'success', userId: outcome.user.id }));
  Logger.auth(
    username,
    local ? '本地登录成功' : outcome.mode === 'portal-only' ? '成功（仅门户）' : '成功',
    200,
    local ? 0 : outcome.durationMs,
    outcome.user.name,
    outcome.steps,
  );
  resetAuthLoginRateLimit(rateLimitKey);
  return success(c, {
    token: outcome.token,
    user: {
      name: outcome.user.name,
      studentId: outcome.user.studentId,
      className: outcome.user.className,
    },
  });
}

function respondWithFailure(c: Context, username: string, rateLimitKey: string, outcome: LoginFailure) {
  if (outcome.countsAsFailure) recordFailure(c, rateLimitKey);

  switch (outcome.reason) {
    case 'captcha-session-missing':
    case 'captcha-session-invalid':
      appendHttpLogDetail(c, `result=${outcome.reason}`);
      return error(c, ErrorCode.CAPTCHA_ERROR, outcome.message, 400);
    case 'execution-fetch-failed': {
      appendHttpLogDetail(c, 'result=execution-fetch-failed');
      Logger.error('Auth', 'execution 获取失败', outcome.cause);
      const timeout = (outcome.cause as any)?.message === 'REQUEST_TIMEOUT';
      return timeout
        ? error(c, ErrorCode.UPSTREAM_TIMEOUT, '学校服务器超时', 504)
        : error(c, ErrorCode.INTERNAL_ERROR, '登录服务异常', 500);
    }
    case 'missing-execution':
      appendHttpLogDetail(c, 'result=missing-execution');
      return error(c, ErrorCode.CAS_LOGIN_FAILED, outcome.message, 400);
    case 'captcha-session-init-failed':
      appendHttpLogDetail(c, 'result=captcha-session-init-failed');
      Logger.auth(username, '验证码会话初始化失败', 400, outcome.durationMs, undefined, outcome.steps);
      return error(c, ErrorCode.CAPTCHA_ERROR, outcome.message, 400);
    case 'captcha-required':
      appendHttpLogDetail(c, 'result=captcha-required');
      Logger.auth(username, '需要验证码', 400, outcome.durationMs, undefined, outcome.steps);
      return c.json({
        success: false,
        error_code: ErrorCode.CAPTCHA_ERROR,
        error_message: '需要验证码',
        needCaptcha: true,
        sessionId: outcome.challenge!.sessionId,
        captchaImage: outcome.challenge!.captchaImage,
      }, 400);
    case 'captcha-fetch-failed':
      appendHttpLogDetail(c, 'result=captcha-fetch-failed');
      Logger.auth(username, '验证码获取失败', 400, outcome.durationMs, undefined, outcome.steps);
      return error(c, ErrorCode.CAPTCHA_ERROR, outcome.message, 400);
    case 'cas-failed':
      appendHttpLogDetail(c, 'result=cas-failed');
      Logger.auth(username, outcome.message, 400, outcome.durationMs, undefined, outcome.steps);
      return error(c, ErrorCode.CAS_LOGIN_FAILED, outcome.message, 400);
    case 'school-activation-failed':
      appendHttpLogDetail(c, 'result=school-activation-failed');
      Logger.auth(username, '学校系统激活失败', 400, outcome.durationMs, undefined, outcome.steps);
      return error(c, ErrorCode.CAS_LOGIN_FAILED, outcome.message, 400);
    case 'upstream-timeout':
    case 'exception':
      appendHttpLogDetail(c, formatHttpLogDetail({
        result: outcome.reason === 'upstream-timeout' ? 'upstream-timeout' : 'exception',
      }));
      Logger.error('Auth', '登录异常', outcome.cause);
      return outcome.reason === 'upstream-timeout'
        ? error(c, ErrorCode.UPSTREAM_TIMEOUT, '学校服务器超时', 504)
        : error(c, ErrorCode.INTERNAL_ERROR, '登录服务异常', 500);
  }
}

auth.post('/login', async (c) => {
  let rawBody: unknown;
  try {
    rawBody = await c.req.json();
  } catch {
    return error(c, ErrorCode.PARAM_ERROR, '请求体必须是有效的 JSON', 400);
  }

  const body = parseLoginRequestDto(rawBody);
  if (!body) return error(c, ErrorCode.PARAM_ERROR, '用户名和密码不能为空', 400);

  const clientIp = getAuthLoginClientIp(c);
  const rateLimitKey = buildAuthLoginRateLimitKey(body.username, clientIp);
  const rateLimitStatus = getAuthLoginRateLimitStatus(rateLimitKey);
  if (rateLimitStatus.limited) {
    c.header('Retry-After', String(rateLimitStatus.retryAfterSeconds));
    appendHttpLogDetail(c, formatHttpLogDetail({
      username: body.username,
      clientIp: clientIp || undefined,
      result: 'rate-limited',
      retryAfterSeconds: rateLimitStatus.retryAfterSeconds,
    }));
    return error(c, ErrorCode.TOO_MANY_REQUESTS, '登录失败次数过多，请稍后再试', 429, {
      retryAfterSeconds: rateLimitStatus.retryAfterSeconds,
    });
  }

  appendHttpLogDetail(c, formatHttpLogDetail({
    username: body.username,
    loginMode: body.sessionId ? 'captcha' : 'password',
    hasCaptcha: Boolean(body.captcha),
    clientIp: clientIp || undefined,
  }));

  const outcome = await loginService.execute(body, {
    onLocalShortcutDisabled: () => appendHttpLogDetail(c, 'localShortcut=disabled-need-captcha'),
  });
  return outcome.kind === 'success'
    ? respondWithSuccess(c, body.username, rateLimitKey, outcome)
    : respondWithFailure(c, body.username, rateLimitKey, outcome);
});

export default auth;
