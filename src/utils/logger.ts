import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';

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

function time(): string {
  const now = new Date();
  const M = String(now.getMonth() + 1).padStart(2, '0');
  const D = String(now.getDate()).padStart(2, '0');
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  return `${c.gray}${M}-${D} ${h}:${m}:${s}${c.reset}`;
}

function statusColor(status: number): string {
  if (status >= 500) return `${c.bgRed} ${status} ${c.reset}`;
  if (status >= 400) return `${c.yellow}${status}${c.reset}`;
  return `${c.green}${status}${c.reset}`;
}

function durationStr(ms: number): string {
  const str = `${Math.round(ms)}ms`.padStart(6);
  if (ms >= 1500) return `${c.bgYellow}⚡${str}${c.reset}`;
  return `${c.gray}${str}${c.reset}`;
}

function userStr(studentId?: string, name?: string): string {
  if (!studentId) return '';
  return `  ${c.cyan}${studentId}${c.reset}${name ? ` ${c.bold}${name}${c.reset}` : ''}`;
}

function subLine(symbol: string, text: string): void {
  console.log(`${' '.repeat(18)}${c.gray}${symbol} ${text}${c.reset}`);
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
    winston.format.timestamp(),
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
  http(method: string, path: string, status: number, ms: number, studentId?: string, name?: string, meta?: { cached?: boolean; source?: string }) {
    const tag = method === 'POST'
      ? `${c.magenta}${method.padEnd(4)}${c.reset}`
      : `${c.cyan}${method.padEnd(4)}${c.reset}`;

    let cacheTag = '';
    if (meta) {
      if (meta.cached) {
        cacheTag = `  ${c.yellow}▪ cache${c.reset}`;
      } else if (meta.source) {
        cacheTag = `  ${c.green}▪ ${meta.source}${c.reset}`;
      }
    }

    console.log(
      `${time()} ${tag} ${path} ${statusColor(status)} ${durationStr(ms)}${userStr(studentId, name)}${cacheTag}`
    );
    fileLogger.info('http', { method, path, status, ms, studentId, name, cached: meta?.cached, source: meta?.source });
  },

  auth(
    studentId: string,
    result: string,
    status: number,
    ms: number,
    name?: string,
    steps?: LoginStep[]
  ) {
    const isSilent = result.includes('静默');
    const isError = result.includes('失败') || result.includes('异常') || result.includes('激活失败');
    const tag = isError
      ? `${c.red}ERR ${c.reset}`
      : isSilent
        ? `${c.magenta}CAS↻${c.reset}`
        : `${c.blue}AUTH${c.reset}`;
    const resultColor = isError ? c.red : result.includes('成功') ? c.green : c.yellow;

    console.log(
      `${time()} ${tag} ${c.cyan}${studentId}${c.reset} → ${resultColor}${result}${c.reset}` +
      ` ${durationStr(ms)}${name ? ` ${c.bold}${name}${c.reset}` : ''}`
    );

    if (steps && steps.length > 0) {
      const hasFailure = steps.some(s => !s.ok);
      if (hasFailure) {
        steps.forEach((step, i) => {
          const isLast = i === steps.length - 1;
          const symbol = isLast ? '└' : '├';
          const mark = step.ok ? `${c.green}✓${c.reset}` : `${c.red}✗${c.reset}`;
          const detail = step.detail ? ` ${c.gray}${step.detail}${c.reset}` : '';
          subLine(symbol, `${step.label} ${mark}${detail}`);
        });
      } else {
        const summary = steps.map(s => `${s.label} ${c.green}✓${c.reset}`).join(`${c.gray}  ${c.reset}`);
        subLine('├', summary);
      }
    }

    fileLogger.info('auth', { studentId, result, status, ms, name, steps });
  },

  server(msg: string) {
    console.log(`${time()} ${c.green}SRV${c.reset} ${msg}`);
    fileLogger.info('server', { msg });
  },

  serverBanner(port: number, env: string) {
    const line = '━'.repeat(20);
    console.log(`${time()} ${c.green}SRV${c.reset} ${c.gray}${line}${c.reset}`);
    console.log(`${time()} ${c.green}SRV${c.reset} 启动 :${c.cyan}${port}${c.reset} ${c.gray}${env}${c.reset}`);
  },

  serverReady(port: number) {
    console.log(`${time()} ${c.green}SRV${c.reset} ${c.green}✓${c.reset} 已就绪`);
    const line = '━'.repeat(20);
    console.log(`${time()} ${c.green}SRV${c.reset} ${c.gray}${line}${c.reset}`);
  },

  warn(tag: string, msg: string, detail?: string, studentId?: string, name?: string) {
    console.log(
      `${time()} ${c.yellow}WARN${c.reset} [${tag}] ${msg}${userStr(studentId, name)}`
    );
    if (detail) subLine('└', detail);
    fileLogger.warn(msg, { tag, detail, studentId, name });
  },

  error(tag: string, msg: string, err?: any, studentId?: string, name?: string) {
    const errInfo = err instanceof Error ? err.message : (err || '');
    console.error(
      `${time()} ${c.red}ERR ${c.reset} [${tag}] ${msg}${userStr(studentId, name)}`
    );
    if (errInfo) subLine('└', `${c.red}${errInfo}${c.reset}`);
    fileLogger.error(msg, { tag, error: errInfo, studentId, name });
  },

  parser(name: string, action: string) {
    console.log(`${time()} ${c.gray}· ${action}${c.reset}`);
  },

  detail(text: string) {
    subLine('└', text);
  },
};
