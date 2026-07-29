/**
 * [INPUT]: 依赖 shared HTTP envelope 与认证实体类型，消费 `/auth/login` 的成功、验证码挑战和业务错误响应
 * [OUTPUT]: 对外提供 loginWithPassword、登录请求/结果类型与稳定认证错误码
 * [POS]: entities/auth 的服务端协议适配器，将传输 envelope 收敛为登录 feature 可判别的结果
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { ApiError, requestEnvelope } from '@/shared/api/http-client';
import type { UserBrief } from '@/entities/auth/model/auth-types';

export const AUTH_ERROR_CODES = {
  LOGIN_FAILED: 3001,
} as const;

interface LoginSuccessData {
  token: string;
  user: UserBrief;
}

export interface CaptchaRequiredResult {
  type: 'captcha_required';
  sessionId: string;
  captchaImage: string;
  message: string;
}

export interface LoginSuccessResult {
  type: 'success';
  token: string;
  user: UserBrief;
}

export type LoginResult = CaptchaRequiredResult | LoginSuccessResult;

export interface LoginPayload {
  username: string;
  password: string;
  captcha?: string;
  sessionId?: string;
}

export async function loginWithPassword(payload: LoginPayload): Promise<LoginResult> {
  const { status, payload: envelope } = await requestEnvelope<LoginSuccessData>(
    '/auth/login',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    { auth: false }
  );

  if (!envelope) {
    throw new ApiError(status, null, '登录暂时不可用，请稍后再试');
  }

  if (envelope.success) {
    return {
      type: 'success',
      token: envelope.data.token,
      user: {
        name: envelope.data.user.name || '校园用户',
        studentId: envelope.data.user.studentId,
        className: envelope.data.user.className || '',
      },
    };
  }

  if (envelope.needCaptcha && envelope.sessionId && envelope.captchaImage) {
    return {
      type: 'captcha_required',
      sessionId: envelope.sessionId,
      captchaImage: envelope.captchaImage,
      message: envelope.error_message || '需要验证码',
    };
  }

  throw new ApiError(
    status,
    envelope.error_code ?? null,
    envelope.error_message || '登录失败',
    envelope
  );
}
