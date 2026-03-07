export enum ErrorCode {
  // 3xxx - School system errors
  CAS_LOGIN_FAILED = 3001,
  CAPTCHA_ERROR = 3002,
  CREDENTIAL_EXPIRED = 3003,
  UPSTREAM_TIMEOUT = 3004,

  // 4xxx - Business errors
  JWT_INVALID = 4001,
  PARAM_ERROR = 4002,

  // 5xxx - System errors
  INTERNAL_ERROR = 5000,
}

const errorHttpStatus: Record<number, number> = {
  [ErrorCode.CAS_LOGIN_FAILED]: 400,
  [ErrorCode.CAPTCHA_ERROR]: 400,
  [ErrorCode.CREDENTIAL_EXPIRED]: 401,
  [ErrorCode.UPSTREAM_TIMEOUT]: 504,
  [ErrorCode.JWT_INVALID]: 401,
  [ErrorCode.PARAM_ERROR]: 400,
  [ErrorCode.INTERNAL_ERROR]: 500,
};

export class AppError extends Error {
  public code: ErrorCode;
  public httpStatus: number;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.code = code;
    this.httpStatus = errorHttpStatus[code] || 500;
  }
}
