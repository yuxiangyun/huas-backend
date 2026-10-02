/**
 * [INPUT]: 依赖 Hono 请求/响应上下文、Fetch 流/取消合同、统一错误码与 Logger
 * [OUTPUT]: 对外提供 requestBodyLimit、multipartRequestMaxBytes 与 isBodyLimitError，按消费限制正文并收尾原流
 * [POS]: utils 的共享 multipart 请求体边界，声明长度预检后惰性计数，持有本请求的原 reader 与取消 Promise
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import type { MiddlewareHandler } from 'hono';
import { ErrorCode } from './errors';
import { Logger } from './logger';
import { error } from './response';

const MULTIPART_OVERHEAD_BYTES = 1024 * 1024;

export interface RequestBodyLimitOptions {
  maxSize: number;
  tooLargeMessage: string;
}

class BodyLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BodyLimitError';
  }
}

async function cancelUnusedBody(body: Request['body'], reason: unknown): Promise<void> {
  // 已被其他 reader 占用的流不属于本层；不能偷取其锁或改写它的读取结果。
  if (!body || body.locked) return;
  try {
    await body.cancel(reason);
  } catch (cause) {
    Logger.error('RequestBodyLimit', '请求体取消失败', cause);
  }
}

function createLimitedBody(
  source: ReadableStream<Uint8Array>,
  signal: AbortSignal,
  options: RequestBodyLimitOptions,
) {
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let output: ReadableStreamDefaultController<Uint8Array> | undefined;
  let size = 0;
  let ended = false;
  let stopped = false;
  let exceeded = false;
  let cleanupPromise: Promise<void> | undefined;

  const cleanup = (reason?: unknown): Promise<void> => {
    // 先赋值，再调用原流 cancel，避免同步取消回调重入时生成第二条清理链。
    cleanupPromise ??= Promise.resolve().then(async () => {
      try {
        if (!ended) {
          await (reader ? reader.cancel(reason) : source.cancel(reason));
        }
      } catch (cause) {
        Logger.error('RequestBodyLimit', '请求体取消失败', cause);
      } finally {
        try {
          reader?.releaseLock();
        } catch (cause) {
          Logger.error('RequestBodyLimit', '请求体 reader 释放失败', cause);
        }
      }
    });
    return cleanupPromise;
  };

  const stop = (reason: unknown): Promise<void> => {
    if (!stopped) {
      stopped = true;
      output?.error(reason);
    }
    return cleanup(reason);
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      output = controller;
    },
    async pull(controller) {
      if (stopped) return;
      try {
        if (!reader) {
          reader = source.getReader();
          // closed 只消费终止状态的拒绝；read 仍向正文消费者传播原失败。
          void reader.closed.catch(() => undefined);
        }
        const { done, value } = await reader.read();
        if (stopped) return;
        if (done) {
          ended = true;
          stopped = true;
          controller.close();
          await cleanup();
          return;
        }
        if (value.byteLength > options.maxSize - size) {
          exceeded = true;
          await stop(new BodyLimitError(options.tooLargeMessage));
          return;
        }
        size += value.byteLength;
        controller.enqueue(value);
      } catch (cause) {
        await stop(cause);
      }
    },
    cancel(reason) {
      stopped = true;
      return cleanup(reason);
    },
  }, { highWaterMark: 0 });

  const onAbort = () => {
    // cleanup 自身消费失败；finally 仍 await 同一 Promise，不遗留取消尾部。
    void stop(signal.reason ?? new DOMException('请求已取消', 'AbortError'));
  };
  signal.addEventListener('abort', onAbort, { once: true });
  if (signal.aborted) onAbort();

  return {
    stream,
    get exceeded() { return exceeded; },
    async dispose(): Promise<void> {
      signal.removeEventListener('abort', onAbort);
      await stop(new Error('请求体读取已结束'));
    },
  };
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

  return async (c, next) => {
    const raw = c.req.raw;
    const contentLength = parseContentLength(c.req.header('content-length'));
    if (contentLength === null) {
      await cancelUnusedBody(raw.body, new Error('Content-Length 不合法'));
      return error(c, ErrorCode.PARAM_ERROR, 'Content-Length 不合法', 400);
    }
    if (contentLength !== undefined && contentLength > options.maxSize) {
      await cancelUnusedBody(raw.body, new BodyLimitError(options.tooLargeMessage));
      return error(c, ErrorCode.PARAM_ERROR, options.tooLargeMessage, 413);
    }
    if (!raw.body) return next();
    if (raw.bodyUsed || raw.body.locked) {
      await cancelUnusedBody(raw.body, new Error('请求体不可读取'));
      return error(c, ErrorCode.PARAM_ERROR, '请求体不可读取，请重新提交', 400);
    }

    const limited = createLimitedBody(raw.body, raw.signal, options);
    try {
      // Request 构造只替换 body；保留原 method/url/headers/signal，不 clone/tee 或清 Hono cache。
      const requestInit = { body: limited.stream, duplex: 'half' };
      c.req.raw = new Request(raw, requestInit);
      await next();
      // Hono compose 将下游 Error 转为 c.error；流超限也可能被原生 formData 包装。
      if (limited.exceeded || isBodyLimitError(c.error)) {
        c.res = error(c, ErrorCode.PARAM_ERROR, options.tooLargeMessage, 413);
      }
    } catch (cause) {
      if (!limited.exceeded && !isBodyLimitError(cause)) throw cause;
      c.res = error(c, ErrorCode.PARAM_ERROR, options.tooLargeMessage, 413);
    } finally {
      // 429、字段预检、解析失败、异常和未读正文均由本请求等待取消/解锁完成。
      await limited.dispose();
    }
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
