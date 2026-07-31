/**
 * [INPUT]: 依赖 Hono bodyLimit、统一错误码与响应工具
 * [OUTPUT]: 对外提供 requestBodyLimit、multipartRequestMaxBytes 与 isBodyLimitError，统一声明长度和流式请求体门禁
 * [POS]: utils 的无状态 HTTP 请求体边界，被各 multipart 上传路由复用并在解析前稳定返回 413
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import type { MiddlewareHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { ErrorCode } from './errors';
import { error } from './response';

const MULTIPART_OVERHEAD_BYTES = 1024 * 1024;

export interface RequestBodyLimitOptions {
  maxSize: number;
  tooLargeMessage: string;
}

export function multipartRequestMaxBytes(payloadMaxBytes: number): number {
  const maxSize = payloadMaxBytes + MULTIPART_OVERHEAD_BYTES;
  if (!Number.isSafeInteger(payloadMaxBytes) || payloadMaxBytes <= 0 || !Number.isSafeInteger(maxSize)) {
    throw new RangeError('multipart payload size limit must be a positive safe integer');
  }
  return maxSize;
}

export function requestBodyLimit(options: RequestBodyLimitOptions): MiddlewareHandler {
  if (!Number.isSafeInteger(options.maxSize) || options.maxSize <= 0) {
    throw new RangeError('request body size limit must be a positive safe integer');
  }

  const limit = bodyLimit({
    maxSize: options.maxSize,
    onError: (c) => error(c, ErrorCode.PARAM_ERROR, options.tooLargeMessage, 413),
  });

  return async (c, next) => {
    const contentLength = parseContentLength(c.req.header('content-length'));
    if (contentLength === null) {
      return error(c, ErrorCode.PARAM_ERROR, 'Content-Length 不合法', 400);
    }
    if (contentLength !== undefined && contentLength > options.maxSize) {
      return error(c, ErrorCode.PARAM_ERROR, options.tooLargeMessage, 413);
    }
    return limit(c, next);
  };
}

export function isBodyLimitError(cause: unknown): cause is Error {
  return cause instanceof Error && cause.name === 'BodyLimitError';
}

function parseContentLength(value: string | undefined): number | null | undefined {
  if (value === undefined) return undefined;
  if (!/^\d+$/u.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}
