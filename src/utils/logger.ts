/**
 * [INPUT]: 依赖 winston、DailyRotateFile 与北京时区时间工具
 * [OUTPUT]: 对外提供 Logger 日志门面与 LoginStep 类型
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
  if (stream === 'stderr') {
    console.error(line);
    return;
  }
  console.log(line);
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

// Winston file logger
const fileLogger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({ format: () => beijingIsoString() }),
    winston.format.json()
  ),
  transports: [
    new DailyRotateFile({
      filename: 'logs/huas-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d',
    }),
    new DailyRotateFile({
      filename: 'logs/error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxSize: '20m',
      maxFiles: '30d',
    }),
  ],
});

export const Logger = {
  http(
    method: string,
    path: string,
    status: number,
    ms: number,
    studentId?: string,
    name?: string,
    meta?: { cached?: boolean; source?: string },
    detail?: string[]
  ) {
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

    fileLogger.info('http', {
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
  },

  auth(
    studentId: string,
    result: string,
    status: number,
    ms: number,
    name?: string,
    steps?: LoginStep[]
  ) {
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

    fileLogger.info('auth', { studentId, result, status, ms, name, steps });
  },

  server(msg: string) {
    printMainLine('stdout', 'info', 'SRV', [msg]);
    fileLogger.info('server', { msg });
  },

  serverBanner(port: number, env: string) {
    printMainLine('stdout', 'info', 'SRV', [
      fit('server starting', SUMMARY_WIDTH),
      colorize(`port=${port}`, c.cyan),
      colorize(`env=${env}`, c.gray),
    ]);
  },

  serverReady(port: number) {
    printMainLine('stdout', 'info', 'SRV', [
      fit('server ready', SUMMARY_WIDTH),
      colorize(`port=${port}`, c.cyan),
    ]);
  },

  warn(tag: string, msg: string, detail?: string, studentId?: string, name?: string) {
    printMainLine('stdout', 'warn', 'APP', [
      fit(`${tag} ${msg}`, SUMMARY_WIDTH),
      ...formatIdentity(studentId, name),
    ]);
    printDetailLines('stdout', [detail]);
    fileLogger.warn(msg, { tag, detail, studentId, name });
  },

  error(tag: string, msg: string, err?: any, studentId?: string, name?: string) {
    const errInfo = err instanceof Error ? err.message : (err || '');
    printMainLine('stderr', 'error', 'APP', [
      fit(`${tag} ${msg}`, SUMMARY_WIDTH),
      ...formatIdentity(studentId, name),
    ]);
    printDetailLines('stderr', [errInfo ? String(errInfo) : undefined], c.red);
    fileLogger.error(msg, { tag, error: errInfo, studentId, name });
  },

  parser(name: string, action: string, studentId?: string, userName?: string) {
    if (SHOW_PARSER_SUCCESS) {
      printMainLine('stdout', 'info', 'PARSE', [
        fit(`${name} ${action}`, SUMMARY_WIDTH),
        ...formatIdentity(studentId, userName),
      ]);
    }
    fileLogger.info('parser', { name, action, studentId, userName });
  },

  operation(scope: string, action: string, actorId?: string, actorName?: string, detail?: string) {
    printMainLine('stdout', 'info', 'OPS', [
      fit(`${scope} ${action}`, SUMMARY_WIDTH),
      ...formatIdentity(actorId, actorName),
    ]);
    printDetailLines('stdout', [detail]);
    fileLogger.info('operation', { scope, action, actorId, actorName, detail });
  },

  detail(text: string) {
    printDetailLines('stdout', [text]);
  },
};
