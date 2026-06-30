/**
 * [INPUT]: 无运行时依赖，承载 API 错误码与默认 HTTP 状态映射
 * [OUTPUT]: 对外提供 ErrorCode 枚举与 AppError 类型
 * [POS]: utils 的错误语义源，被 services、parsers、middleware 与 routes 共同消费
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export enum ErrorCode {
  // 3xxx - School system errors
  CAS_LOGIN_FAILED = 3001,
  CAPTCHA_ERROR = 3002,
  CREDENTIAL_EXPIRED = 3003,
  UPSTREAM_TIMEOUT = 3004,
  SERVICE_ACCOUNT_UNAVAILABLE = 3005,

  // 4xxx - Business errors
  JWT_INVALID = 4001,
  PARAM_ERROR = 4002,
  TOO_MANY_REQUESTS = 4003,
  EVALUATION_REQUIRED = 4004,

  // 5xxx - System errors
  INTERNAL_ERROR = 5000,
}

const errorHttpStatus: Record<number, number> = {
  [ErrorCode.CAS_LOGIN_FAILED]: 400,
  [ErrorCode.CAPTCHA_ERROR]: 400,
  [ErrorCode.CREDENTIAL_EXPIRED]: 401,
  [ErrorCode.UPSTREAM_TIMEOUT]: 504,
  [ErrorCode.SERVICE_ACCOUNT_UNAVAILABLE]: 503,
  [ErrorCode.JWT_INVALID]: 401,
  [ErrorCode.PARAM_ERROR]: 400,
  [ErrorCode.TOO_MANY_REQUESTS]: 429,
  [ErrorCode.EVALUATION_REQUIRED]: 409,
  [ErrorCode.INTERNAL_ERROR]: 500,
};

export class AppError extends Error {
  public code: ErrorCode;
  public httpStatus: number;
  public data?: unknown;

  constructor(code: ErrorCode, message: string, data?: unknown) {
    super(message);
    this.code = code;
    this.httpStatus = errorHttpStatus[code] || 500;
    this.data = data;
  }
}
