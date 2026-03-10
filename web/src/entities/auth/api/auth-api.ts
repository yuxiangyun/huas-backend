import { ApiError, requestEnvelope } from '@/shared/api/http-client';
import type { UserBrief } from '@/entities/auth/model/auth-types';

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
