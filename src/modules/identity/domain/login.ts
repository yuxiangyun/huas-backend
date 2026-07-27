/**
 * [INPUT]: 无外部实现依赖，仅承载 Identity/Login 稳定业务事实
 * [OUTPUT]: 对外提供登录用户、学校步骤、凭证提交与登录结果类型
 * [POS]: identity/domain 的语言核心，供 application 编排并由 infrastructure/http 分别实现与映射
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export interface LoginStep {
  label: string;
  ok: boolean;
  detail?: string;
}

export interface LoginUser {
  id: number;
  studentId: string;
  name: string | null;
  className: string | null;
  encryptedPassword: string | null;
}

export interface LoginCredentialSet {
  casCookieJar: string;
  portalToken: string | null;
  jwCookieJar: string | null;
}

export interface LoginSuccess {
  kind: 'success';
  mode: 'local' | 'school' | 'portal-only';
  token: string;
  user: {
    id: number;
    studentId: string;
    name?: string;
    className: string;
  };
  durationMs: number;
  steps: LoginStep[];
}

export type LoginFailureReason =
  | 'captcha-session-missing'
  | 'captcha-session-invalid'
  | 'execution-fetch-failed'
  | 'missing-execution'
  | 'captcha-session-init-failed'
  | 'captcha-fetch-failed'
  | 'captcha-required'
  | 'cas-failed'
  | 'school-activation-failed'
  | 'upstream-timeout'
  | 'exception';

export interface LoginFailure {
  kind: 'failure';
  reason: LoginFailureReason;
  message: string;
  durationMs: number;
  steps: LoginStep[];
  countsAsFailure: boolean;
  cause?: unknown;
  challenge?: {
    sessionId: string;
    captchaImage: string;
  };
}

export type LoginOutcome = LoginSuccess | LoginFailure;
