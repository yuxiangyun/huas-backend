/**
 * [INPUT]: 依赖 winston、DailyRotateFile 的队列/轮转生命周期与北京时区时间工具
 * [OUTPUT]: 对外提供隔离初始化/输出错误、按依赖结束文件并有界等待全部轮转流完成的 Logger 门面与 LoginStep 类型
 * [POS]: utils 的日志契约源，统一控制台彩色输出、文件轮转和业务/认证/HTTP/解析日志格式
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { beijingDateTime, beijingIsoString } from './time';

// Color codes
const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
  gray: '\x1b[90m',
  bgRed: '\x1b[41m\x1b[37m',
  bgYellow: '\x1b[43m\x1b[30m',
};

type OutputStream = 'stdout' | 'stderr';
type LogLevel = 'info' | 'warn' | 'error';

const DETAIL_INDENT = ' '.repeat(18);
const HTTP_PATH_WIDTH = 36;
const SUMMARY_WIDTH = 40;
const SHOW_PARSER_SUCCESS = process.env.LOG_PARSER_SUCCESS === '1';

function time(): string {
  const short = beijingDateTime().slice(11);
  return `${c.gray}${short}${c.reset}`;
}

function statusColor(status: number): string {
  if (status >= 500) return `${c.bgRed} ${status} ${c.reset}`;
  if (status >= 400) return `${c.yellow}${status}${c.reset}`;
  return `${c.green}${status}${c.reset}`;
}

function fit(value: string, width: number, align: 'start' | 'end' = 'start'): string {
  if (value.length > width) {
    return align === 'end'
      ? `...${value.slice(-(width - 3))}`
      : `${value.slice(0, width - 3)}...`;
  }
  return align === 'end' ? value.padStart(width) : value.padEnd(width);
}

function colorize(value: string, color: string): string {
  return `${color}${value}${c.reset}`;
}

function writeLine(stream: OutputStream, line: string): void {
  try {
    if (stream === 'stderr') {
      console.error(line);
      return;
    }
    console.log(line);
  } catch {
    // 控制台失败也不能阻止同一次日志继续尝试文件输出。
  }
}

function reportLogFailure(error: unknown): void {
  try {
    console.error('[Logger] 日志输出失败', error);
  } catch {
    // 失败报告本身也是旁路，不能递归使用 Logger 或向业务调用方抛错。
  }
}

function bestEffortLog<Args extends unknown[]>(write: (...args: Args) => void): (...args: Args) => void {
  return (...args) => {
    try {
      write(...args);
    } catch (error) {
      reportLogFailure(error);
    }
  };
}

function levelStyle(level: LogLevel) {
  if (level === 'error') {
    return { label: 'ERROR', color: c.red };
  }
  if (level === 'warn') {
    return { label: 'WARN', color: c.yellow };
  }
  return { label: 'INFO', color: c.green };
}

function scopeColor(scope: string): string {
  if (scope === 'HTTP') return c.cyan;
  if (scope === 'AUTH') return c.blue;
  if (scope === 'OPS') return c.magenta;
  if (scope === 'SRV') return c.green;
  return c.gray;
}

function formatHeader(level: LogLevel, scope: string): string {
  const levelInfo = levelStyle(level);
  const levelLabel = colorize(fit(levelInfo.label, 5), levelInfo.color);
  const scopeLabel = colorize(fit(scope, 5), scopeColor(scope));
  return `${time()}  ${levelLabel}  ${scopeLabel}`;
}

function formatDuration(ms: number): string {
  const text = fit(`${Math.round(ms)}ms`, 8, 'end');
  return ms >= 1500 ? colorize(text, c.yellow) : colorize(text, c.gray);
}

function formatIdentity(studentId?: string, name?: string): string[] {
  const parts: string[] = [];
  if (studentId) parts.push(colorize(`sid=${studentId}`, c.cyan));
  if (name) parts.push(colorize(name, c.bold));
  return parts;
}

function normalizeDetailLine(text: string): string {
  return text.replace(/;\s*/g, '  ').trim();
}

function detailLines(lines: Array<string | undefined>): string[] {
  return lines
    .filter((line): line is string => Boolean(line && line.trim()))
    .map((line) => normalizeDetailLine(line));
}

function printDetailLines(
  stream: OutputStream,
  lines: Array<string | undefined>,
  color: string = c.gray
): void {
  detailLines(lines).forEach((line) => {
    writeLine(stream, `${DETAIL_INDENT}${color}${line}${c.reset}`);
  });
}

function printMainLine(
  stream: OutputStream,
  level: LogLevel,
  scope: string,
  parts: Array<string | undefined>
) {
  const summary = parts.filter(Boolean).join('  ');
  writeLine(stream, `${formatHeader(level, scope)}  ${summary}`);
}

function formatStepSummary(steps?: LoginStep[]): string[] {
  if (!steps || steps.length === 0) return [];

  const rendered = steps.map((step) => {
    const status = step.ok ? 'ok' : 'fail';
    return step.detail ? `${step.label}=${status}  detail=${step.detail}` : `${step.label}=${status}`;
  });

  if (steps.some((step) => !step.ok)) {
    return rendered;
  }

  return [rendered.join('  ')];
}

export interface LoginStep {
  label: string;
  ok: boolean;
  detail?: string;
}

interface FileLoggerResources {
  logger: ReturnType<typeof winston.createLogger>;
  fileStreams: FileStreamWaiter[];
}

type FileStreamWaiter = (cleanups: Array<() => void>) => Promise<void>;

export interface LoggerFlushResult {
  ok: boolean;
  error?: string;
}

function observeFileStreams(stream: NodeJS.WritableStream): FileStreamWaiter {
  // 当前配置只由 write 触发 rotate；watchLog=false，不会走 createLog 换流。
  // 初始流已在构造时创建；不用会重复通知初始文件的 new 事件计数。
  let pending = 1;
  let failed = false;
  let failure: unknown;
  const waiters = new Set<{ resolve(): void; reject(error: unknown): void }>();
  const settle = () => {
    if (!failed && pending !== 0) return;
    for (const waiter of waiters) {
      if (failed) waiter.reject(failure);
      else waiter.resolve();
    }
    waiters.clear();
  };
  stream.on('rotate', () => { pending += 1; });
  stream.on('finish', () => { pending -= 1; settle(); });
  stream.on('error', (error: unknown) => {
    failed = true;
    failure = error;
    settle();
  });
  return (cleanups) => new Promise<void>((resolve, reject) => {
    const waiter = { resolve, reject };
    waiters.add(waiter);
    cleanups.push(() => { waiters.delete(waiter); });
    settle();
  });
}

function createFileLogger(): FileLoggerResources | undefined {
  let logger: ReturnType<typeof winston.createLogger> | undefined;
  let pendingTransport: DailyRotateFile | undefined;
  const fileStreams: FileStreamWaiter[] = [];
  try {
    logger = winston.createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: winston.format.combine(
        winston.format.timestamp({ format: () => beijingIsoString() }),
        winston.format.json()
      ),
    });
    logger.on('error', reportLogFailure);
    const options: DailyRotateFile.DailyRotateFileTransportOptions[] = [{
      filename: 'logs/huas-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d',
    }, {
      filename: 'logs/error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxSize: '20m',
      maxFiles: '30d',
    }];

    for (const option of options) {
      pendingTransport = new DailyRotateFile(option);
      // 当前 DailyRotateFile 不转发底层 logStream 的 error，必须直接消费文件流失败。
      pendingTransport.logStream.on('error', reportLogFailure);
      const waitForStreams = observeFileStreams(pendingTransport.logStream);
      pendingTransport.on('error', reportLogFailure);
      logger.add(pendingTransport);
      // add 后由 Winston 转发 transport error，避免同一事件重复报告。
      pendingTransport.off('error', reportLogFailure);
      fileStreams.push(waitForStreams);
      pendingTransport = undefined;
    }
    return { logger, fileStreams };
  } catch (error) {
    try {
      pendingTransport?.close?.();
    } catch (cleanupError) {
      reportLogFailure(cleanupError);
    }
    try {
      logger?.close();
    } catch (cleanupError) {
      reportLogFailure(cleanupError);
    }
    reportLogFailure(error);
    return undefined;
  }
}

let fileLogger = createFileLogger();
let loggerFlushPromise: Promise<LoggerFlushResult> | undefined;

function waitForFinish(
  emitter: Pick<NodeJS.EventEmitter, 'once' | 'removeListener'>,
  name: string,
  cleanups: Array<() => void>,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const release = () => {
      emitter.removeListener('finish', onFinish);
      emitter.removeListener('error', onError);
      emitter.removeListener('close', onClose);
    };
    const onFinish = () => { release(); resolve(); };
    const onError = (error: unknown) => { release(); reject(error); };
    const onClose = () => { release(); reject(new Error(`${name} closed before finish`)); };
    cleanups.push(release);
    emitter.once('finish', onFinish);
    emitter.once('error', onError);
    emitter.once('close', onClose);
  });
}

function flushFileLogger(timeoutMs = 5_000): Promise<LoggerFlushResult> {
  if (loggerFlushPromise) return loggerFlushPromise;
  const resources = fileLogger;
  // 所有业务与关闭阶段日志已完成；后续失败报告只走控制台，不能写入已结束的文件流。
  fileLogger = undefined;
  loggerFlushPromise = (async () => {
    if (!resources) return { ok: true };
    const cleanups: Array<() => void> = [];
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      // Winston finish 只保证 transport 的消息队列结束；文件流仍可能持有待写字节。
      // transport finish 已自动 unpipe/close 并 end 当前文件；不能重复 end 已结束的流。
      // 先等消息队列，再等包含当前文件的全部轮转流计数归零，不采用任意一次 proxy.finish。
      const loggerFinished = waitForFinish(resources.logger, 'logger', cleanups);
      const drain = Promise.all([
        Promise.resolve().then(() => { resources.logger.end(); }),
        loggerFinished,
      ]).then(() => Promise.all(resources.fileStreams.map((waitForStreams) => (
        waitForStreams(cleanups)
      ))));
      const budget = Number.isSafeInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 2_147_483_647
        ? timeoutMs : 5_000;
      await Promise.race([
        drain,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error(`logger flush timeout after ${budget}ms`)), budget);
        }),
      ]);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    } finally {
      if (timer !== undefined) clearTimeout(timer);
      for (const cleanup of cleanups) cleanup();
      try {
        resources.logger.close();
      } catch (error) {
        reportLogFailure(error);
      }
    }
  })();
  return loggerFlushPromise;
}

export const Logger = {
  flush: flushFileLogger,
  http: bestEffortLog((
    method: string,
    path: string,
    status: number,
    ms: number,
    studentId?: string,
    name?: string,
    meta?: { cached?: boolean; source?: string },
    detail?: string[]
  ) => {
    const methodColor = method === 'POST' ? c.magenta : c.cyan;
    const normalizedDetail = detailLines(detail ?? []);
    const mainParts = [
      colorize(fit(method, 6), methodColor),
      fit(path, HTTP_PATH_WIDTH),
      statusColor(status),
      formatDuration(ms),
      ...formatIdentity(studentId, name),
    ];

    printMainLine('stdout', 'info', 'HTTP', mainParts);

    const metaLine = meta?.cached
      ? 'source=cache'
      : meta?.source
        ? `source=${meta.source}`
        : undefined;

    const consoleDetail = [...normalizedDetail];
    if (metaLine) {
      if (consoleDetail.length > 0) {
        consoleDetail[0] = `${metaLine}  ${consoleDetail[0]}`;
      } else {
        consoleDetail.push(metaLine);
      }
    }

    printDetailLines('stdout', consoleDetail);

    fileLogger?.logger.info('http', {
      method,
      path,
      status,
      ms,
      studentId,
      name,
      cached: meta?.cached,
      source: meta?.source,
      detail: normalizedDetail.length > 0 ? normalizedDetail : undefined,
    });
  }),

  auth: bestEffortLog((
    studentId: string,
    result: string,
    status: number,
    ms: number,
    name?: string,
    steps?: LoginStep[]
  ) => {
    const isWarn = result.includes('需要验证码')
      || result.includes('失败')
      || result.includes('异常')
      || result.includes('激活失败');
    const level: LogLevel = isWarn ? 'warn' : 'info';

    printMainLine('stdout', level, 'AUTH', [
      fit(result, SUMMARY_WIDTH),
      formatDuration(ms),
      ...formatIdentity(studentId, name),
    ]);

    printDetailLines('stdout', formatStepSummary(steps));

    fileLogger?.logger.info('auth', { studentId, result, status, ms, name, steps });
  }),

  server: bestEffortLog((msg: string) => {
    printMainLine('stdout', 'info', 'SRV', [msg]);
    fileLogger?.logger.info('server', { msg });
  }),

  serverBanner: bestEffortLog((port: number, env: string) => {
    printMainLine('stdout', 'info', 'SRV', [
      fit('server starting', SUMMARY_WIDTH),
      colorize(`port=${port}`, c.cyan),
      colorize(`env=${env}`, c.gray),
    ]);
  }),

  serverReady: bestEffortLog((port: number) => {
    printMainLine('stdout', 'info', 'SRV', [
      fit('server ready', SUMMARY_WIDTH),
      colorize(`port=${port}`, c.cyan),
    ]);
  }),

  warn: bestEffortLog((tag: string, msg: string, detail?: string, studentId?: string, name?: string) => {
    printMainLine('stdout', 'warn', 'APP', [
      fit(`${tag} ${msg}`, SUMMARY_WIDTH),
      ...formatIdentity(studentId, name),
    ]);
    printDetailLines('stdout', [detail]);
    fileLogger?.logger.warn(msg, { tag, detail, studentId, name });
  }),

  error: bestEffortLog((tag: string, msg: string, err?: unknown, studentId?: string, name?: string) => {
    const errInfo = err instanceof Error ? err.message : (err || '');
    printMainLine('stderr', 'error', 'APP', [
      fit(`${tag} ${msg}`, SUMMARY_WIDTH),
      ...formatIdentity(studentId, name),
    ]);
    printDetailLines('stderr', [errInfo ? String(errInfo) : undefined], c.red);
    fileLogger?.logger.error(msg, { tag, error: errInfo, studentId, name });
  }),

  parser: bestEffortLog((name: string, action: string, studentId?: string, userName?: string) => {
    if (SHOW_PARSER_SUCCESS) {
      printMainLine('stdout', 'info', 'PARSE', [
        fit(`${name} ${action}`, SUMMARY_WIDTH),
        ...formatIdentity(studentId, userName),
      ]);
    }
    fileLogger?.logger.info('parser', { name, action, studentId, userName });
  }),

  operation: bestEffortLog((scope: string, action: string, actorId?: string, actorName?: string, detail?: string) => {
    printMainLine('stdout', 'info', 'OPS', [
      fit(`${scope} ${action}`, SUMMARY_WIDTH),
      ...formatIdentity(actorId, actorName),
    ]);
    printDetailLines('stdout', [detail]);
    fileLogger?.logger.info('operation', { scope, action, actorId, actorName, detail });
  }),

  detail: bestEffortLog((text: string) => {
    printDetailLines('stdout', [text]);
  }),
};
