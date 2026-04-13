#!/usr/bin/env node

import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_INPUT_DIR = '/tmp/huas-log-report/raw';
const DEFAULT_OUTPUT_PATH = path.resolve('reports/huas-log-report.html');
const MASK_SALT = 'huas-log-report-v1';

const inputDir = path.resolve(process.argv[2] || DEFAULT_INPUT_DIR);
const outputPath = path.resolve(process.argv[3] || DEFAULT_OUTPUT_PATH);

function fail(message) {
  console.error(message);
  process.exit(1);
}

if (!fs.existsSync(inputDir)) {
  fail(`Input directory not found: ${inputDir}`);
}

function stripAnsi(input) {
  return input.replace(/\u001b\[[0-9;]*m/g, '');
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value >= 100 ? value.toFixed(0) : value.toFixed(value >= 10 ? 1 : 2)} ${units[index]}`;
}

function formatPct(value, digits = 1) {
  if (!Number.isFinite(value)) return '0%';
  return `${(value * 100).toFixed(digits)}%`;
}

function aliasFor(value, cache = new Map()) {
  const normalized = String(value || '').trim();
  if (!normalized) return 'U-UNKNOWN';
  if (cache.has(normalized)) return cache.get(normalized);
  const hash = createHash('sha256').update(`${MASK_SALT}:${normalized}`).digest('hex').slice(0, 8).toUpperCase();
  const alias = `U-${hash}`;
  cache.set(normalized, alias);
  return alias;
}

function sanitizeText(text, aliasCache) {
  if (!text) return '';
  return String(text)
    .replace(/\bS?\d{5,}\b/g, (match) => aliasFor(match, aliasCache))
    .replace(/username=([^;]+)/g, (_match, value) => `username=${aliasFor(value, aliasCache)}`);
}

function inc(counter, key, amount = 1) {
  if (!key) return;
  counter[key] = (counter[key] || 0) + amount;
}

function pushArray(map, key, value) {
  if (!Number.isFinite(value)) return;
  if (!map[key]) map[key] = [];
  map[key].push(value);
}

function ensureDay(map, day) {
  if (!map[day]) {
    map[day] = {
      events: 0,
      http: 0,
      auth: 0,
      warn: 0,
      error: 0,
      server: 0,
      scheduleHttp: 0,
      loginHttp: 0,
      cacheAware: 0,
      cacheHit: 0,
      slow1500: 0,
      sessionExpired: 0,
      jwRetry: 0,
      portalRetry: 0,
      silentRefreshJwSuccess: 0,
      silentRefreshJwFail: 0,
      silentRefreshPortalSuccess: 0,
      silentRefreshPortalFail: 0,
      silentReauthSuccess: 0,
      silentReauthFail: 0,
      silentReauthException: 0,
      refreshFallback: 0,
      getScheduleFailed: 0,
      credentialExpired: 0,
      rawLines: 0,
      rawHttp: 0,
      rawAuth: 0,
      rawWarn: 0,
      rawError: 0,
      rawServer: 0,
    };
  }
  return map[day];
}

function ensureHour(map, hour) {
  if (!map[hour]) {
    map[hour] = {
      http: 0,
      schedule: 0,
      login: 0,
      auth: 0,
      cacheHit: 0,
      slow1500: 0,
    };
  }
  return map[hour];
}

function ensurePathStats(map, key) {
  if (!map[key]) {
    map[key] = {
      count: 0,
      methods: {},
      statuses: {},
      statusClass: {},
      ms: [],
      cacheAware: 0,
      cacheHit: 0,
      sources: {},
      users: new Set(),
      slow1500: 0,
    };
  }
  return map[key];
}

function ensureUserStats(map, alias) {
  if (!map[alias]) {
    map[alias] = {
      alias,
      http: 0,
      schedule: 0,
      login: 0,
      auth: 0,
      cacheHit: 0,
      ms: [],
      paths: {},
    };
  }
  return map[alias];
}

function ensureAuthResultStats(map, key) {
  if (!map[key]) {
    map[key] = {
      count: 0,
      ms: [],
      statuses: {},
    };
  }
  return map[key];
}

function ensureStepStats(map, key) {
  if (!map[key]) {
    map[key] = {
      ok: 0,
      fail: 0,
    };
  }
  return map[key];
}

function statusClass(status) {
  if (!Number.isFinite(status)) return 'unknown';
  return `${Math.floor(status / 100)}xx`;
}

function percentile(sortedValues, p) {
  if (!sortedValues.length) return 0;
  const index = Math.min(sortedValues.length - 1, Math.max(0, Math.ceil((p / 100) * sortedValues.length) - 1));
  return sortedValues[index];
}

function summarizeMs(values) {
  if (!values.length) {
    return {
      count: 0,
      avg: 0,
      min: 0,
      p50: 0,
      p90: 0,
      p95: 0,
      p99: 0,
      max: 0,
    };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, value) => acc + value, 0);
  return {
    count: sorted.length,
    avg: sum / sorted.length,
    min: sorted[0],
    p50: percentile(sorted, 50),
    p90: percentile(sorted, 90),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    max: sorted[sorted.length - 1],
  };
}

function topEntries(counter, limit = 12, minCount = 1) {
  return Object.entries(counter)
    .map(([label, count]) => ({ label, count }))
    .filter((item) => item.count >= minCount)
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, limit);
}

function topObjects(items, limit = 12, key = 'count') {
  return items
    .slice()
    .sort((a, b) => (b[key] || 0) - (a[key] || 0))
    .slice(0, limit);
}

function parseDetailFields(detail) {
  const fields = {};
  for (const line of Array.isArray(detail) ? detail : []) {
    for (const chunk of String(line).split(/\s*;\s*/)) {
      const match = chunk.match(/^([^=]+)=(.*)$/);
      if (!match) continue;
      const key = match[1].trim();
      const value = match[2].trim();
      if (key) fields[key] = value;
    }
  }
  return fields;
}

function classifyAuthResult(result) {
  const value = String(result || '').trim();
  if (!value) return 'other.unknown';
  if (value === '成功') return 'interactive.success';
  if (value === '本地登录成功') return 'interactive.local_success';
  if (value === '需要验证码') return 'interactive.need_captcha';
  if (value === '验证码获取失败') return 'interactive.captcha_fetch_failed';
  if (value === '验证码会话初始化失败') return 'interactive.captcha_session_init_failed';
  if (value === '教务系统激活失败') return 'interactive.jw_activation_failed';
  if (value === '登录失败') return 'interactive.login_failed';
  if (value.startsWith('静默刷新 JW')) return value.includes('失败') ? 'silent_refresh_jw.fail' : 'silent_refresh_jw.success';
  if (value.startsWith('静默刷新 Portal')) return value.includes('失败') ? 'silent_refresh_portal.fail' : 'silent_refresh_portal.success';
  if (value.startsWith('静默重认证成功')) return 'silent_reauth.success';
  if (value.startsWith('静默重认证失败')) return 'silent_reauth.fail';
  if (value.startsWith('静默重认证异常')) return 'silent_reauth.exception';
  return `other.${value}`;
}

function safeJson(data) {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026');
}

function fileTypeFor(name) {
  if (/^huas-\d{4}-\d{2}-\d{2}\.log$/.test(name)) return 'structured-main';
  if (/^error-\d{4}-\d{2}-\d{2}\.log$/.test(name)) return 'structured-error';
  if (name === 'pm2-out.log') return 'pm2-out';
  if (name === 'pm2-error.log') return 'pm2-error';
  if (/^-?\.?.+-audit\.json$/.test(name)) return 'audit';
  if (name.endsWith('.json')) return 'json';
  return 'other';
}

function parseRawPm2Line(line) {
  const cleanLine = stripAnsi(line).replace(/\r/g, '');
  const match = cleanLine.match(/^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}):\s*(.*)$/);
  if (!match) {
    return {
      kind: 'other',
      raw: cleanLine.trim(),
    };
  }

  const timestamp = `${match[1]}+08:00`;
  let body = match[2].trim();
  body = body.replace(/^\d{2}-\d{2} \d{2}:\d{2}:\d{2}\s+/, '').trim();

  const httpMatch = body.match(/^(GET|POST|PUT|PATCH|DELETE)\s+(\S+)\s+(\d{3})\s+(?:⚡)?\s*(\d+)ms(?:\s+(\S+))?(?:\s+([^\s▪]+))?(?:\s+▪\s+(\S+))?$/);
  if (httpMatch) {
    const [, method, reqPath, status, ms, possibleUserId, possibleName, source] = httpMatch;
    return {
      kind: 'http',
      timestamp,
      method,
      path: reqPath,
      status: Number(status),
      ms: Number(ms),
      studentId: possibleUserId,
      name: possibleName,
      source,
      cached: source === 'cache',
    };
  }

  const authMatch = body.match(/^(AUTH|CAS↻|ERR)\s+(\S+)\s+→\s+(.+?)\s+(\d+)ms(?:\s+(.+))?$/);
  if (authMatch) {
    const [, tag, studentId, result, ms] = authMatch;
    return {
      kind: 'auth',
      timestamp,
      tag,
      studentId,
      result: result.trim(),
      ms: Number(ms),
    };
  }

  const warnMatch = body.match(/^WARN\s+\[([^\]]+)\]\s+(.+)$/);
  if (warnMatch) {
    return {
      kind: 'warn',
      timestamp,
      tag: warnMatch[1],
      message: warnMatch[2].trim(),
    };
  }

  const errorMatch = body.match(/^ERR\s+\[([^\]]+)\]\s+(.+)$/);
  if (errorMatch) {
    return {
      kind: 'error',
      timestamp,
      tag: errorMatch[1],
      message: errorMatch[2].trim(),
    };
  }

  const serverMatch = body.match(/^SRV\s+(.+)$/);
  if (serverMatch) {
    return {
      kind: 'server',
      timestamp,
      message: serverMatch[1].trim(),
    };
  }

  const detailMatch = body.match(/^[├└]\s+(.+)$/);
  if (detailMatch) {
    return {
      kind: 'detail',
      timestamp,
      message: detailMatch[1].trim(),
    };
  }

  const parserMatch = body.match(/^·\s+(.+)$/);
  if (parserMatch) {
    return {
      kind: 'parser',
      timestamp,
      message: parserMatch[1].trim(),
    };
  }

  return {
    kind: 'other',
    timestamp,
    raw: body,
  };
}

function collectFiles(dir) {
  return fs.readdirSync(dir)
    .map((name) => {
      const fullPath = path.join(dir, name);
      const stat = fs.statSync(fullPath);
      return {
        name,
        fullPath,
        size: stat.size,
        mtimeMs: stat.mtimeMs,
        type: fileTypeFor(name),
      };
    })
    .filter((file) => file.type !== 'other')
    .sort((a, b) => a.name.localeCompare(b.name));
}

const aliasCache = new Map();
const files = collectFiles(inputDir);
const report = {
  meta: {
    generatedAt: new Date().toISOString(),
    inputDir,
    outputPath,
    notes: [
      '全量日志文件均已读取，但为了避免重复计数，报表将 structured-main、structured-error、PM2 raw 分层展示。',
      '所有学号、用户名均已做稳定脱敏，报告内仅显示不可逆别名。',
      '业务指标以 structured-main 为主，错误历史使用 structured-main 与 structured-error 去重合并，PM2 raw 作为更长时间窗口的原始补充。',
    ],
  },
  inventory: {
    totalFiles: files.length,
    totalBytes: files.reduce((acc, file) => acc + file.size, 0),
    typeCounts: {},
    largestFiles: [],
    files: [],
    audits: [],
  },
  structuredMain: {
    coverage: {
      firstTimestamp: null,
      lastTimestamp: null,
      days: 0,
    },
    totals: {
      events: 0,
      http: 0,
      auth: 0,
      warn: 0,
      error: 0,
      server: 0,
      uniqueUsers: 0,
      uniquePaths: 0,
    },
    levels: {},
    messages: {},
    tagMessages: {},
    daily: {},
    hourly: {},
    http: {
      methods: {},
      statuses: {},
      statusClass: {},
      sources: {},
      slowBands: {
        lt100: 0,
        lt500: 0,
        lt1500: 0,
        ge1500: 0,
      },
      durations: [],
      paths: {},
      topSlow: [],
    },
    schedule: {
      total: 0,
      legacy: 0,
      v1: 0,
      cached: 0,
      cacheAware: 0,
      sources: {},
      durations: [],
      users: new Set(),
      byDay: {},
      byHour: {},
      topSlow: [],
    },
    login: {
      httpTotal: 0,
      httpStatuses: {},
      detailResults: {},
      modes: {},
      hasCaptcha: {},
      portalToken: {},
      users: new Set(),
      byDay: {},
      authResults: {},
      authKinds: {},
      authDurations: {},
    },
    cache: {
      cacheAwareResponses: 0,
      cacheHits: 0,
      refreshFallback: 0,
      refreshFallbackSource: {},
      staleUsers: new Set(),
    },
    credentials: {
      sessionExpired: {},
      upstreamRetry: {},
      silentRefresh: {},
      silentReauth: {},
      finalFailures: {},
      cooldownSkips: 0,
      stepStats: {},
    },
    users: {},
  },
  unifiedErrors: {
    coverage: {
      firstTimestamp: null,
      lastTimestamp: null,
      days: 0,
    },
    total: 0,
    daily: {},
    bySignature: {},
    byTag: {},
  },
  rawPm2: {
    coverage: {
      firstTimestamp: null,
      lastTimestamp: null,
      days: 0,
    },
    totals: {
      lines: 0,
      http: 0,
      auth: 0,
      warn: 0,
      error: 0,
      server: 0,
      parser: 0,
      detail: 0,
      other: 0,
      uniquePaths: 0,
    },
    daily: {},
    http: {
      methods: {},
      statuses: {},
      paths: {},
      sources: {},
      durations: [],
    },
    authResults: {},
    warnings: {},
    errors: {},
  },
};

const unifiedErrorSignatures = new Set();

for (const file of files) {
  inc(report.inventory.typeCounts, file.type);
  report.inventory.files.push({
    name: file.name,
    type: file.type,
    size: file.size,
    sizeLabel: formatBytes(file.size),
    modifiedAt: new Date(file.mtimeMs).toISOString(),
  });
}

report.inventory.largestFiles = report.inventory.files
  .slice()
  .sort((a, b) => b.size - a.size)
  .slice(0, 12);

for (const file of files) {
  if (file.type === 'audit') {
    try {
      const data = JSON.parse(fs.readFileSync(file.fullPath, 'utf8'));
      report.inventory.audits.push({
        file: file.name,
        keepDays: Boolean(data?.keep?.days),
        keepAmount: Number(data?.keep?.amount || 0),
        rotatedFiles: Array.isArray(data?.files) ? data.files.length : 0,
        firstRotatedAt: Array.isArray(data?.files) && data.files.length ? new Date(Math.min(...data.files.map((item) => Number(item.date || 0)))).toISOString() : null,
        lastRotatedAt: Array.isArray(data?.files) && data.files.length ? new Date(Math.max(...data.files.map((item) => Number(item.date || 0)))).toISOString() : null,
      });
    } catch {
      report.inventory.audits.push({
        file: file.name,
        keepDays: false,
        keepAmount: 0,
        rotatedFiles: 0,
        firstRotatedAt: null,
        lastRotatedAt: null,
      });
    }
  }
}

for (const file of files) {
  const text = fs.readFileSync(file.fullPath, 'utf8');
  const lines = text.split(/\n/).filter(Boolean);

  if (file.type === 'structured-main' || file.type === 'structured-error') {
    for (const line of lines) {
      let entry;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }
      const timestamp = String(entry.timestamp || '');
      const day = timestamp.slice(0, 10);
      const hour = timestamp.slice(11, 13) || '00';
      const level = String(entry.level || 'unknown');
      const message = sanitizeText(entry.message || '', aliasCache);
      const tag = sanitizeText(entry.tag || '', aliasCache);
      const studentId = entry.studentId ? String(entry.studentId) : '';
      const alias = studentId ? aliasFor(studentId, aliasCache) : null;

      if (file.type === 'structured-main') {
        const dayStats = ensureDay(report.structuredMain.daily, day);
        const hourStats = ensureHour(report.structuredMain.hourly, hour);
        dayStats.events += 1;
        report.structuredMain.totals.events += 1;
        inc(report.structuredMain.levels, level);
        inc(report.structuredMain.messages, message);
        if (tag || message) {
          inc(report.structuredMain.tagMessages, `${tag || 'NO_TAG'} :: ${message}`);
        }

        if (!report.structuredMain.coverage.firstTimestamp || timestamp < report.structuredMain.coverage.firstTimestamp) {
          report.structuredMain.coverage.firstTimestamp = timestamp;
        }
        if (!report.structuredMain.coverage.lastTimestamp || timestamp > report.structuredMain.coverage.lastTimestamp) {
          report.structuredMain.coverage.lastTimestamp = timestamp;
        }

        if (alias) {
          const user = ensureUserStats(report.structuredMain.users, alias);
          if (entry.name) user.displayName = null;
        }

        if (level === 'warn') {
          dayStats.warn += 1;
          report.structuredMain.totals.warn += 1;
        }
        if (level === 'error') {
          dayStats.error += 1;
          report.structuredMain.totals.error += 1;
        }

        if (message === 'http') {
          const reqPath = String(entry.path || 'unknown');
          const method = String(entry.method || 'GET');
          const status = Number(entry.status || 0);
          const ms = Number(entry.ms || 0);
          const source = entry.source ? String(entry.source) : '';
          const cached = entry.cached === true;
          const cacheAware = Object.prototype.hasOwnProperty.call(entry, 'cached') || Boolean(source);
          const isSchedule = reqPath === '/api/schedule' || reqPath === '/api/v1/schedule';
          const isLogin = reqPath === '/auth/login';

          dayStats.http += 1;
          hourStats.http += 1;
          report.structuredMain.totals.http += 1;
          report.structuredMain.http.durations.push(ms);
          inc(report.structuredMain.http.methods, method);
          inc(report.structuredMain.http.statuses, String(status));
          inc(report.structuredMain.http.statusClass, statusClass(status));

          if (ms < 100) report.structuredMain.http.slowBands.lt100 += 1;
          else if (ms < 500) report.structuredMain.http.slowBands.lt500 += 1;
          else if (ms < 1500) report.structuredMain.http.slowBands.lt1500 += 1;
          else report.structuredMain.http.slowBands.ge1500 += 1;

          const pathStats = ensurePathStats(report.structuredMain.http.paths, reqPath);
          pathStats.count += 1;
          pushArray({ _: pathStats.ms }, '_', ms);
          inc(pathStats.methods, method);
          inc(pathStats.statuses, String(status));
          inc(pathStats.statusClass, statusClass(status));
          if (source) inc(pathStats.sources, source);
          if (cacheAware) {
            pathStats.cacheAware += 1;
            report.structuredMain.cache.cacheAwareResponses += 1;
            dayStats.cacheAware += 1;
          }
          if (cached) {
            pathStats.cacheHit += 1;
            report.structuredMain.cache.cacheHits += 1;
            dayStats.cacheHit += 1;
            hourStats.cacheHit += 1;
          }
          if (ms >= 1500) {
            pathStats.slow1500 += 1;
            dayStats.slow1500 += 1;
            hourStats.slow1500 += 1;
            report.structuredMain.http.topSlow.push({
              timestamp,
              path: reqPath,
              ms,
              status,
              source: source || (cached ? 'cache' : 'none'),
              cached,
              alias,
            });
          }
          if (source) inc(report.structuredMain.http.sources, source);

          if (alias) {
            pathStats.users.add(alias);
            const user = ensureUserStats(report.structuredMain.users, alias);
            user.http += 1;
            if (cached) user.cacheHit += 1;
            user.ms.push(ms);
            inc(user.paths, reqPath);
          }

          if (isSchedule) {
            report.structuredMain.schedule.total += 1;
            report.structuredMain.schedule.durations.push(ms);
            if (reqPath === '/api/schedule') report.structuredMain.schedule.legacy += 1;
            if (reqPath === '/api/v1/schedule') report.structuredMain.schedule.v1 += 1;
            if (cacheAware) report.structuredMain.schedule.cacheAware += 1;
            if (cached) report.structuredMain.schedule.cached += 1;
            if (source) inc(report.structuredMain.schedule.sources, source);
            dayStats.scheduleHttp += 1;
            hourStats.schedule += 1;
            inc(ensureDay(report.structuredMain.schedule.byDay, day), 'scheduleHttp');
            inc(ensureHour(report.structuredMain.schedule.byHour, hour), 'schedule');
            if (ms >= 1500) {
              report.structuredMain.schedule.topSlow.push({
                timestamp,
                path: reqPath,
                ms,
                status,
                source: source || (cached ? 'cache' : 'none'),
                alias,
              });
            }
            if (alias) {
              report.structuredMain.schedule.users.add(alias);
              const user = ensureUserStats(report.structuredMain.users, alias);
              user.schedule += 1;
            }
          }

          if (isLogin) {
            report.structuredMain.login.httpTotal += 1;
            dayStats.loginHttp += 1;
            hourStats.login += 1;
            inc(report.structuredMain.login.httpStatuses, String(status));

            const detailFields = parseDetailFields(entry.detail);
            if (detailFields.result) inc(report.structuredMain.login.detailResults, sanitizeText(detailFields.result, aliasCache));
            if (detailFields.loginMode) inc(report.structuredMain.login.modes, sanitizeText(detailFields.loginMode, aliasCache));
            if (Object.prototype.hasOwnProperty.call(detailFields, 'hasCaptcha')) {
              inc(report.structuredMain.login.hasCaptcha, String(detailFields.hasCaptcha));
            }
            if (Object.prototype.hasOwnProperty.call(detailFields, 'portalToken')) {
              inc(report.structuredMain.login.portalToken, String(detailFields.portalToken));
            }
            if (detailFields.username) {
              const loginAlias = aliasFor(detailFields.username, aliasCache);
              report.structuredMain.login.users.add(loginAlias);
              const user = ensureUserStats(report.structuredMain.users, loginAlias);
              user.login += 1;
            }
          }
        } else if (message === 'auth') {
          const result = sanitizeText(entry.result || '', aliasCache);
          const authKind = classifyAuthResult(result);
          const ms = Number(entry.ms || 0);
          const status = Number(entry.status || 0);
          dayStats.auth += 1;
          hourStats.auth += 1;
          report.structuredMain.totals.auth += 1;

          const authStats = ensureAuthResultStats(report.structuredMain.login.authDurations, authKind);
          authStats.count += 1;
          authStats.ms.push(ms);
          inc(authStats.statuses, String(status));

          inc(report.structuredMain.login.authResults, result);
          inc(report.structuredMain.login.authKinds, authKind);

          if (authKind.startsWith('interactive.')) {
            const byDay = ensureDay(report.structuredMain.login.byDay, day);
            byDay.auth += 1;
          }

          if (authKind === 'silent_refresh_jw.success') {
            inc(report.structuredMain.credentials.silentRefresh, 'jw.success');
            dayStats.silentRefreshJwSuccess += 1;
          } else if (authKind === 'silent_refresh_jw.fail') {
            inc(report.structuredMain.credentials.silentRefresh, 'jw.fail');
            dayStats.silentRefreshJwFail += 1;
          } else if (authKind === 'silent_refresh_portal.success') {
            inc(report.structuredMain.credentials.silentRefresh, 'portal.success');
            dayStats.silentRefreshPortalSuccess += 1;
          } else if (authKind === 'silent_refresh_portal.fail') {
            inc(report.structuredMain.credentials.silentRefresh, 'portal.fail');
            dayStats.silentRefreshPortalFail += 1;
          } else if (authKind === 'silent_reauth.success') {
            inc(report.structuredMain.credentials.silentReauth, 'success');
            dayStats.silentReauthSuccess += 1;
          } else if (authKind === 'silent_reauth.fail') {
            inc(report.structuredMain.credentials.silentReauth, 'fail');
            dayStats.silentReauthFail += 1;
          } else if (authKind === 'silent_reauth.exception') {
            inc(report.structuredMain.credentials.silentReauth, 'exception');
            dayStats.silentReauthException += 1;
          }

          for (const step of Array.isArray(entry.steps) ? entry.steps : []) {
            const label = sanitizeText(step.label || 'unknown', aliasCache);
            const stat = ensureStepStats(report.structuredMain.credentials.stepStats, label);
            if (step.ok) stat.ok += 1;
            else stat.fail += 1;
          }

          if (alias) {
            const user = ensureUserStats(report.structuredMain.users, alias);
            user.auth += 1;
          }
        } else if (message === 'server') {
          dayStats.server += 1;
          report.structuredMain.totals.server += 1;
        } else {
          if (message === 'Session 过期') {
            inc(report.structuredMain.credentials.sessionExpired, tag || 'unknown');
            dayStats.sessionExpired += 1;
          }
          if (message.includes('会话过期, 重试中')) {
            const key = message.startsWith('portal_jwt') ? 'portal_jwt' : 'jw_session';
            inc(report.structuredMain.credentials.upstreamRetry, key);
            if (key === 'portal_jwt') dayStats.portalRetry += 1;
            else dayStats.jwRetry += 1;
          }
          if (tag === 'RefreshFallback') {
            report.structuredMain.cache.refreshFallback += 1;
            dayStats.refreshFallback += 1;
            const source = message.startsWith('portal') ? 'portal' : 'jw';
            inc(report.structuredMain.cache.refreshFallbackSource, source);
            if (alias) report.structuredMain.cache.staleUsers.add(alias);
          }
          if (tag === 'SilentReAuth' && message.includes('冷却中')) {
            report.structuredMain.credentials.cooldownSkips += 1;
          }
          if (message === 'GET_SCHEDULE_FAILED') {
            dayStats.getScheduleFailed += 1;
          }
          if (message.includes('凭证刷新失败') || message.includes('凭证已过期')) {
            inc(report.structuredMain.credentials.finalFailures, message);
            dayStats.credentialExpired += 1;
          }
        }
      }

      if (level === 'error') {
        const signature = `${timestamp}|${tag}|${message}|${sanitizeText(entry.error || '', aliasCache)}`;
        if (!unifiedErrorSignatures.has(signature)) {
          unifiedErrorSignatures.add(signature);
          report.unifiedErrors.total += 1;
          inc(report.unifiedErrors.byTag, tag || 'NO_TAG');
          inc(report.unifiedErrors.bySignature, `${tag || 'NO_TAG'} :: ${message}`);
          const dayStats = ensureDay(report.unifiedErrors.daily, day);
          dayStats.error += 1;
          if (!report.unifiedErrors.coverage.firstTimestamp || timestamp < report.unifiedErrors.coverage.firstTimestamp) {
            report.unifiedErrors.coverage.firstTimestamp = timestamp;
          }
          if (!report.unifiedErrors.coverage.lastTimestamp || timestamp > report.unifiedErrors.coverage.lastTimestamp) {
            report.unifiedErrors.coverage.lastTimestamp = timestamp;
          }
        }
      }
    }
  }

  if (file.type === 'pm2-out' || file.type === 'pm2-error') {
    for (const line of lines) {
      const parsed = parseRawPm2Line(line);
      const timestamp = parsed.timestamp || '';
      const day = timestamp.slice(0, 10);

      report.rawPm2.totals.lines += 1;
      if (!report.rawPm2.coverage.firstTimestamp || (timestamp && timestamp < report.rawPm2.coverage.firstTimestamp)) {
        report.rawPm2.coverage.firstTimestamp = timestamp;
      }
      if (!report.rawPm2.coverage.lastTimestamp || (timestamp && timestamp > report.rawPm2.coverage.lastTimestamp)) {
        report.rawPm2.coverage.lastTimestamp = timestamp;
      }
      if (day) ensureDay(report.rawPm2.daily, day).rawLines += 1;

      switch (parsed.kind) {
        case 'http': {
          report.rawPm2.totals.http += 1;
          if (day) ensureDay(report.rawPm2.daily, day).rawHttp += 1;
          inc(report.rawPm2.http.methods, parsed.method);
          inc(report.rawPm2.http.statuses, String(parsed.status));
          inc(report.rawPm2.http.sources, parsed.source || (parsed.cached ? 'cache' : 'none'));
          pushArray({ _: report.rawPm2.http.durations }, '_', parsed.ms);
          const pathStats = ensurePathStats(report.rawPm2.http.paths, parsed.path);
          pathStats.count += 1;
          pathStats.ms.push(parsed.ms);
          inc(pathStats.statuses, String(parsed.status));
          inc(pathStats.methods, parsed.method);
          if (parsed.source) inc(pathStats.sources, parsed.source);
          break;
        }
        case 'auth':
          report.rawPm2.totals.auth += 1;
          if (day) ensureDay(report.rawPm2.daily, day).rawAuth += 1;
          inc(report.rawPm2.authResults, sanitizeText(parsed.result, aliasCache));
          break;
        case 'warn':
          report.rawPm2.totals.warn += 1;
          if (day) ensureDay(report.rawPm2.daily, day).rawWarn += 1;
          inc(report.rawPm2.warnings, `${sanitizeText(parsed.tag, aliasCache)} :: ${sanitizeText(parsed.message, aliasCache)}`);
          break;
        case 'error':
          report.rawPm2.totals.error += 1;
          if (day) ensureDay(report.rawPm2.daily, day).rawError += 1;
          inc(report.rawPm2.errors, `${sanitizeText(parsed.tag, aliasCache)} :: ${sanitizeText(parsed.message, aliasCache)}`);
          break;
        case 'server':
          report.rawPm2.totals.server += 1;
          if (day) ensureDay(report.rawPm2.daily, day).rawServer += 1;
          break;
        case 'parser':
          report.rawPm2.totals.parser += 1;
          break;
        case 'detail':
          report.rawPm2.totals.detail += 1;
          break;
        default:
          report.rawPm2.totals.other += 1;
          break;
      }
    }
  }
}

report.structuredMain.coverage.days = Object.keys(report.structuredMain.daily).length;
report.unifiedErrors.coverage.days = Object.keys(report.unifiedErrors.daily).length;
report.rawPm2.coverage.days = Object.keys(report.rawPm2.daily).length;

report.structuredMain.totals.uniqueUsers = Object.keys(report.structuredMain.users).length;
report.structuredMain.totals.uniquePaths = Object.keys(report.structuredMain.http.paths).length;
report.rawPm2.totals.uniquePaths = Object.keys(report.rawPm2.http.paths).length;

function summarizePathCollection(pathCollection, totalCount) {
  return Object.entries(pathCollection)
    .map(([key, value]) => {
      const msStats = summarizeMs(value.ms);
      return {
        key,
        count: value.count,
        share: totalCount ? value.count / totalCount : 0,
        users: value.users instanceof Set ? value.users.size : 0,
        methods: topEntries(value.methods, 4),
        statuses: topEntries(value.statuses, 6),
        statusClass: topEntries(value.statusClass || {}, 4),
        sources: topEntries(value.sources, 4),
        cacheAware: value.cacheAware || 0,
        cacheHit: value.cacheHit || 0,
        cacheHitRate: value.cacheAware ? value.cacheHit / value.cacheAware : 0,
        slow1500: value.slow1500 || 0,
        ...msStats,
      };
    })
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

function summarizeUserCollection(userCollection) {
  return Object.values(userCollection)
    .map((user) => {
      const msStats = summarizeMs(user.ms || []);
      return {
        alias: user.alias,
        http: user.http,
        schedule: user.schedule,
        login: user.login,
        auth: user.auth,
        cacheHit: user.cacheHit,
        cacheHitRate: user.http ? user.cacheHit / user.http : 0,
        topPaths: topEntries(user.paths || {}, 3),
        avgMs: msStats.avg,
        p95Ms: msStats.p95,
      };
    })
    .sort((a, b) => b.http - a.http || b.schedule - a.schedule || a.alias.localeCompare(b.alias));
}

function mapDailySeries(dailyMap) {
  return Object.entries(dailyMap)
    .map(([day, value]) => ({ day, ...value }))
    .sort((a, b) => a.day.localeCompare(b.day));
}

function mapHourlySeries(hourlyMap) {
  return Object.entries(hourlyMap)
    .map(([hour, value]) => ({ hour, ...value }))
    .sort((a, b) => a.hour.localeCompare(b.hour));
}

function summarizeAuthDurations(map) {
  return Object.entries(map)
    .map(([key, value]) => ({
      key,
      count: value.count,
      statuses: topEntries(value.statuses, 4),
      ...summarizeMs(value.ms),
    }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

function summarizeStepStats(stepMap) {
  return Object.entries(stepMap)
    .map(([label, value]) => ({
      label,
      total: value.ok + value.fail,
      ok: value.ok,
      fail: value.fail,
      successRate: value.ok + value.fail ? value.ok / (value.ok + value.fail) : 0,
    }))
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
}

report.structuredMain.http.summary = summarizeMs(report.structuredMain.http.durations);
report.structuredMain.http.pathTable = summarizePathCollection(report.structuredMain.http.paths, report.structuredMain.totals.http);
report.structuredMain.http.topSlow = topObjects(report.structuredMain.http.topSlow, 30, 'ms');

report.structuredMain.schedule.summary = summarizeMs(report.structuredMain.schedule.durations);
report.structuredMain.schedule.topSlow = topObjects(report.structuredMain.schedule.topSlow, 24, 'ms');
report.structuredMain.schedule.uniqueUsers = report.structuredMain.schedule.users.size;
report.structuredMain.schedule.cacheHitRate = report.structuredMain.schedule.cacheAware
  ? report.structuredMain.schedule.cached / report.structuredMain.schedule.cacheAware
  : 0;

report.structuredMain.login.authDurationTable = summarizeAuthDurations(report.structuredMain.login.authDurations);
report.structuredMain.login.uniqueUsers = report.structuredMain.login.users.size;
report.structuredMain.login.httpFailureRate = report.structuredMain.login.httpTotal
  ? Object.entries(report.structuredMain.login.httpStatuses)
    .filter(([status]) => Number(status) >= 400)
    .reduce((acc, [, count]) => acc + count, 0) / report.structuredMain.login.httpTotal
  : 0;

report.structuredMain.cache.hitRate = report.structuredMain.cache.cacheAwareResponses
  ? report.structuredMain.cache.cacheHits / report.structuredMain.cache.cacheAwareResponses
  : 0;
report.structuredMain.cache.uniqueStaleUsers = report.structuredMain.cache.staleUsers.size;

report.structuredMain.credentials.stepTable = summarizeStepStats(report.structuredMain.credentials.stepStats);
report.structuredMain.credentials.reauthSuccessRate = (() => {
  const success = report.structuredMain.credentials.silentReauth.success || 0;
  const fail = report.structuredMain.credentials.silentReauth.fail || 0;
  const exception = report.structuredMain.credentials.silentReauth.exception || 0;
  const total = success + fail + exception;
  return total ? success / total : 0;
})();

report.structuredMain.dailySeries = mapDailySeries(report.structuredMain.daily);
report.structuredMain.hourlySeries = mapHourlySeries(report.structuredMain.hourly);
report.unifiedErrors.dailySeries = mapDailySeries(report.unifiedErrors.daily);
report.rawPm2.dailySeries = mapDailySeries(report.rawPm2.daily);
report.structuredMain.topMessages = topEntries(report.structuredMain.messages, 16);
report.structuredMain.topTags = topEntries(report.structuredMain.tagMessages, 20);
report.structuredMain.topUsers = topObjects(summarizeUserCollection(report.structuredMain.users), 20, 'http');
report.unifiedErrors.topSignatures = topEntries(report.unifiedErrors.bySignature, 20);
report.unifiedErrors.topTags = topEntries(report.unifiedErrors.byTag, 12);
report.rawPm2.topWarnings = topEntries(report.rawPm2.warnings, 20);
report.rawPm2.topErrors = topEntries(report.rawPm2.errors, 20);
report.rawPm2.topAuthResults = topEntries(report.rawPm2.authResults, 20);
report.rawPm2.http.summary = summarizeMs(report.rawPm2.http.durations);
report.rawPm2.http.pathTable = summarizePathCollection(report.rawPm2.http.paths, report.rawPm2.totals.http);

const peakDay = report.structuredMain.dailySeries.slice().sort((a, b) => b.http - a.http)[0] || null;
const peakHour = report.structuredMain.hourlySeries.slice().sort((a, b) => b.http - a.http)[0] || null;
const worstErrorDay = report.unifiedErrors.dailySeries.slice().sort((a, b) => b.error - a.error)[0] || null;
const hottestPath = report.structuredMain.http.pathTable[0] || null;
const slowestPath = report.structuredMain.http.pathTable
  .filter((item) => item.count >= 5)
  .slice()
  .sort((a, b) => b.p95 - a.p95)[0] || null;

report.structuredMain.insights = [
  peakDay ? {
    title: '峰值请求日',
    body: `${peakDay.day} 共产生 ${peakDay.http} 条 HTTP 日志，其中课表相关 ${peakDay.scheduleHttp} 条。`,
  } : null,
  peakHour ? {
    title: '峰值小时',
    body: `${peakHour.hour}:00 是结构化日志里的最繁忙小时，记录到 ${peakHour.http} 条 HTTP 请求。`,
  } : null,
  hottestPath ? {
    title: '最热接口',
    body: `${hottestPath.key} 共 ${hottestPath.count} 次，占全部 HTTP 的 ${formatPct(hottestPath.share)}，P95 ${Math.round(hottestPath.p95)}ms。`,
  } : null,
  slowestPath ? {
    title: '最慢高频接口',
    body: `${slowestPath.key} 在高频接口里 P95 最高，达到 ${Math.round(slowestPath.p95)}ms，最大值 ${Math.round(slowestPath.max)}ms。`,
  } : null,
  {
    title: '缓存命中',
    body: `cache-aware 响应 ${report.structuredMain.cache.cacheAwareResponses} 条，命中 ${report.structuredMain.cache.cacheHits} 条，整体命中率 ${formatPct(report.structuredMain.cache.hitRate)}。`,
  },
  {
    title: '静默重认证',
    body: `静默重认证成功率 ${formatPct(report.structuredMain.credentials.reauthSuccessRate)}，成功 ${report.structuredMain.credentials.silentReauth.success || 0}，失败 ${report.structuredMain.credentials.silentReauth.fail || 0}，异常 ${report.structuredMain.credentials.silentReauth.exception || 0}。`,
  },
  worstErrorDay ? {
    title: '错误峰值日',
    body: `${worstErrorDay.day} 在去重后的错误流中记录到 ${worstErrorDay.error} 条 error 事件。`,
  } : null,
].filter(Boolean);

function renderHtml(data) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>HUAS 日志统计报告</title>
  <script src="https://cdn.tailwindcss.com?plugins=typography"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          fontFamily: {
            sans: ['Avenir Next', 'PingFang SC', 'Noto Sans SC', 'system-ui', 'sans-serif'],
            mono: ['SFMono-Regular', 'JetBrains Mono', 'Menlo', 'monospace'],
          },
          boxShadow: {
            soft: '0 18px 48px rgba(24, 38, 66, 0.08)',
          },
        },
      },
    };
  </script>
  <style>
    :root {
      --bg: #f5efe3;
      --panel: rgba(255,255,255,0.88);
      --panel-strong: rgba(255,255,255,0.96);
      --text: #1d2433;
      --muted: #647087;
      --line: rgba(19,32,66,0.12);
      --accent: #005f73;
      --accent-2: #bb3e03;
      --accent-3: #0a9396;
      --accent-4: #ae2012;
      --ok: #2a9d8f;
      --warn: #ee9b00;
      --bad: #ae2012;
      --shadow: 0 18px 48px rgba(24, 38, 66, 0.08);
      --radius: 22px;
      --mono: "SFMono-Regular", "JetBrains Mono", "Menlo", monospace;
      --sans: "Avenir Next", "PingFang SC", "Noto Sans SC", sans-serif;
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background:
      radial-gradient(circle at top left, rgba(10,147,150,0.18), transparent 30%),
      radial-gradient(circle at top right, rgba(238,155,0,0.16), transparent 26%),
      linear-gradient(180deg, #f9f5ec 0%, #f2ebdd 45%, #ece5d8 100%);
      color: var(--text); font-family: var(--sans); }
    body { min-height: 100vh; }
    .shell { width: min(1520px, calc(100vw - 28px)); margin: 0 auto; padding: 20px 0 56px; }
    .hero {
      position: relative;
      overflow: hidden;
      padding: 28px;
      border-radius: 30px;
      background: linear-gradient(135deg, rgba(0,95,115,0.96), rgba(10,147,150,0.94));
      color: #fff;
      box-shadow: var(--shadow);
    }
    .hero::after {
      content: "";
      position: absolute;
      inset: auto -70px -70px auto;
      width: 240px;
      height: 240px;
      border-radius: 50%;
      background: rgba(255,255,255,0.09);
      filter: blur(2px);
    }
    .hero h1 { margin: 0; font-size: clamp(28px, 4vw, 46px); letter-spacing: -0.03em; }
    .hero p { margin: 10px 0 0; max-width: 940px; color: rgba(255,255,255,0.86); line-height: 1.6; }
    .hero-meta {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: 12px;
      margin-top: 24px;
    }
    .hero-meta .pill {
      border: 1px solid rgba(255,255,255,0.18);
      background: rgba(255,255,255,0.08);
      border-radius: 18px;
      padding: 12px 14px;
      backdrop-filter: blur(12px);
    }
    .hero-meta .pill .label { font-size: 12px; color: rgba(255,255,255,0.74); text-transform: uppercase; letter-spacing: 0.08em; }
    .hero-meta .pill .value { margin-top: 6px; font-size: 18px; font-weight: 700; }
    .sticky-nav {
      position: sticky;
      top: 10px;
      z-index: 20;
      margin: 18px 0;
      padding: 10px;
      border-radius: 999px;
      background: rgba(255,255,255,0.7);
      box-shadow: 0 12px 28px rgba(23,36,66,0.1);
      backdrop-filter: blur(18px);
      display: flex;
      gap: 8px;
      overflow: auto;
    }
    .sticky-nav button {
      border: none;
      background: transparent;
      color: var(--muted);
      padding: 10px 14px;
      border-radius: 999px;
      cursor: pointer;
      font-size: 14px;
      font-weight: 700;
      white-space: nowrap;
    }
    .sticky-nav button.active { background: var(--text); color: #fff; }
    .section {
      margin-top: 20px;
      padding: 24px;
      border-radius: var(--radius);
      background: var(--panel);
      box-shadow: var(--shadow);
      border: 1px solid rgba(255,255,255,0.4);
    }
    .section h2 { margin: 0 0 8px; font-size: clamp(20px, 2vw, 28px); letter-spacing: -0.02em; }
    .section .lede { margin: 0 0 18px; color: var(--muted); line-height: 1.65; }
    .grid { display: grid; gap: 14px; }
    .stats-grid { grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); }
    .two-col { grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); }
    .three-col { grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); }
    .card {
      padding: 18px;
      border-radius: 20px;
      background: var(--panel-strong);
      border: 1px solid var(--line);
      min-height: 100%;
    }
    .card h3 {
      margin: 0 0 6px;
      font-size: 16px;
      letter-spacing: -0.01em;
    }
    .card p { margin: 0; color: var(--muted); line-height: 1.6; }
    .metric {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .metric .label {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--muted);
    }
    .metric .value {
      font-size: clamp(24px, 3vw, 34px);
      font-weight: 800;
      letter-spacing: -0.04em;
    }
    .metric .sub { color: var(--muted); font-size: 13px; line-height: 1.6; }
    .bar-list { display: grid; gap: 10px; }
    .bar-row { display: grid; gap: 6px; }
    .bar-row .top { display: flex; justify-content: space-between; gap: 12px; font-size: 13px; color: var(--muted); }
    .bar-track {
      height: 10px;
      background: rgba(29,36,51,0.08);
      border-radius: 999px;
      overflow: hidden;
    }
    .bar-fill {
      height: 100%;
      border-radius: 999px;
      background: linear-gradient(90deg, var(--accent), var(--accent-3));
    }
    .bar-fill.warn { background: linear-gradient(90deg, #e9c46a, var(--warn)); }
    .bar-fill.bad { background: linear-gradient(90deg, #d62828, var(--bad)); }
    .chart {
      background: linear-gradient(180deg, rgba(255,255,255,0.9), rgba(255,255,255,0.72));
      border-radius: 22px;
      border: 1px solid var(--line);
      padding: 16px;
    }
    .chart svg { width: 100%; height: auto; display: block; }
    .legend {
      display: flex;
      flex-wrap: wrap;
      gap: 10px 14px;
      margin-top: 10px;
      font-size: 12px;
      color: var(--muted);
    }
    .legend span { display: inline-flex; align-items: center; gap: 8px; }
    .swatch {
      width: 12px;
      height: 12px;
      border-radius: 999px;
      display: inline-block;
    }
    .heatmap {
      display: grid;
      grid-template-columns: 76px repeat(auto-fit, minmax(18px, 1fr));
      gap: 6px;
      align-items: center;
      font-size: 12px;
      color: var(--muted);
      overflow: auto;
    }
    .heatmap .row-label {
      position: sticky;
      left: 0;
      background: var(--panel-strong);
      padding: 2px 8px 2px 0;
      font-family: var(--mono);
    }
    .heatmap .cell {
      width: 18px;
      height: 18px;
      border-radius: 6px;
      background: rgba(29,36,51,0.06);
      border: 1px solid rgba(29,36,51,0.05);
    }
    .table-wrap { overflow: auto; }
    table {
      width: 100%;
      border-collapse: collapse;
      min-width: 760px;
      font-size: 13px;
    }
    th, td {
      border-bottom: 1px solid var(--line);
      padding: 11px 10px;
      text-align: left;
      vertical-align: top;
    }
    th {
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: var(--muted);
      background: rgba(248,248,248,0.5);
      position: sticky;
      top: 0;
    }
    td code, .mono { font-family: var(--mono); font-size: 12px; }
    .badge {
      display: inline-flex;
      align-items: center;
      padding: 4px 8px;
      border-radius: 999px;
      background: rgba(0,95,115,0.08);
      color: var(--accent);
      font-size: 12px;
      font-weight: 700;
    }
    .badge.warn { background: rgba(238,155,0,0.14); color: #9b5c00; }
    .badge.bad { background: rgba(174,32,18,0.12); color: var(--bad); }
    .note-list { display: grid; gap: 10px; }
    .note {
      padding: 14px 16px;
      border-radius: 16px;
      background: rgba(255,255,255,0.68);
      border: 1px solid var(--line);
      color: var(--muted);
      line-height: 1.6;
    }
    .empty { color: var(--muted); font-style: italic; }
    details {
      border-radius: 18px;
      background: rgba(255,255,255,0.72);
      border: 1px solid var(--line);
      padding: 12px 16px;
    }
    details + details { margin-top: 10px; }
    summary { cursor: pointer; font-weight: 700; }
    .footer {
      margin-top: 24px;
      color: var(--muted);
      text-align: center;
      font-size: 13px;
      line-height: 1.7;
    }
    @media (max-width: 720px) {
      .shell { width: min(100vw - 16px, 1520px); }
      .hero { padding: 22px; border-radius: 24px; }
      .section { padding: 18px; border-radius: 22px; }
      .sticky-nav { top: 6px; }
      table { min-width: 640px; }
    }
  </style>
</head>
<body class="min-h-screen bg-stone-100 text-slate-900 antialiased">
  <div class="shell mx-auto max-w-[1520px] px-2 sm:px-4 pb-14">
    <header class="hero relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-teal-900 via-cyan-800 to-teal-600 p-6 text-white shadow-2xl ring-1 ring-white/15 sm:p-8">
      <h1>HUAS 服务器日志单页统计报告</h1>
      <p>基于全部日志文件生成。业务分析默认以结构化主日志作为主口径，错误历史和 PM2 原始流分别补足时间窗口，并通过去重和分层展示避免重复计数。所有身份标识已脱敏。</p>
      <div class="hero-meta" id="hero-meta"></div>
    </header>
    <nav class="sticky-nav sticky top-2 z-20 my-4 flex gap-2 overflow-x-auto rounded-full bg-white/70 p-2 shadow-soft backdrop-blur" id="nav"></nav>
    <main id="app" class="space-y-5"></main>
    <div class="footer mt-6 text-center text-sm text-slate-500">
      报告生成时间 <span class="mono">${data.meta.generatedAt}</span> · 输入目录 <span class="mono">${data.meta.inputDir}</span><br />
      脱敏规则：学号 / 用户名映射为稳定别名，不展示姓名与原始账号。
    </div>
  </div>
  <script id="report-data" type="application/json">${safeJson(data)}</script>
  <script>
    (() => {
      const data = JSON.parse(document.getElementById('report-data').textContent);
      const app = document.getElementById('app');
      const nav = document.getElementById('nav');
      const heroMeta = document.getElementById('hero-meta');

      const Kit = {
        el(tag, attrs, ...children) {
          const node = document.createElement(tag);
          const source = attrs || {};
          for (const [key, value] of Object.entries(source)) {
            if (value === null || value === undefined) continue;
            if (key === 'class') node.className = value;
            else if (key === 'html') node.innerHTML = value;
            else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
            else node.setAttribute(key, value);
          }
          for (const child of children.flat()) {
            if (child === null || child === undefined) continue;
            node.append(child.nodeType ? child : document.createTextNode(String(child)));
          }
          return node;
        },
        num(value) {
          return new Intl.NumberFormat('zh-CN').format(Number(value || 0));
        },
        pct(value, digits = 1) {
          return (Number(value || 0) * 100).toFixed(digits) + '%';
        },
        ms(value) {
          return Math.round(Number(value || 0)) + ' ms';
        },
        compact(value) {
          const n = Number(value || 0);
          if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
          if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
          return String(Math.round(n));
        },
        section(id, title, lede) {
          return Kit.el('section', { class: 'section scroll-mt-24 rounded-[1.75rem] border border-white/50 bg-white/80 p-5 shadow-soft backdrop-blur sm:p-6', id }, [
            Kit.el('h2', null, title),
            lede ? Kit.el('p', { class: 'lede' }, lede) : null,
          ]);
        },
        statCard(label, value, sub) {
          return Kit.el('div', { class: 'card metric rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm' }, [
            Kit.el('div', { class: 'label' }, label),
            Kit.el('div', { class: 'value' }, value),
            sub ? Kit.el('div', { class: 'sub' }, sub) : null,
          ]);
        },
        card(title, body) {
          return Kit.el('div', { class: 'card rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm' }, [
            Kit.el('h3', null, title),
            typeof body === 'string' ? Kit.el('p', null, body) : body,
          ]);
        },
        barList(items, options = {}) {
          const max = Math.max(1, ...items.map((item) => item.count || item.value || 0));
          const kind = options.kind || 'default';
          return Kit.el('div', { class: 'bar-list' }, items.map((item) => {
            const count = item.count ?? item.value ?? 0;
            return Kit.el('div', { class: 'bar-row' }, [
              Kit.el('div', { class: 'top' }, [
                Kit.el('span', null, item.label),
                Kit.el('span', { class: 'mono' }, item.meta || Kit.num(count)),
              ]),
              Kit.el('div', { class: 'bar-track' }, [
                Kit.el('div', { class: 'bar-fill ' + (kind === 'warn' ? 'warn' : kind === 'bad' ? 'bad' : ''), style: 'width:' + ((count / max) * 100).toFixed(2) + '%' }),
              ]),
            ]);
          }));
        },
        lineChart(series, options = {}) {
          const width = options.width || 1100;
          const height = options.height || 260;
          const pad = { top: 18, right: 18, bottom: 38, left: 40 };
          const labels = options.labels || [];
          const allValues = series.flatMap((item) => item.values);
          const max = Math.max(1, ...allValues);
          const innerW = width - pad.left - pad.right;
          const innerH = height - pad.top - pad.bottom;
          const svg = [];
          svg.push('<svg viewBox="0 0 ' + width + ' ' + height + '" role="img" aria-label="' + (options.title || 'chart') + '">');
          for (let i = 0; i < 5; i += 1) {
            const y = pad.top + (innerH / 4) * i;
            svg.push('<line x1="' + pad.left + '" y1="' + y + '" x2="' + (width - pad.right) + '" y2="' + y + '" stroke="rgba(29,36,51,0.08)" stroke-width="1" />');
            const tickValue = Math.round(max - (max / 4) * i);
            svg.push('<text x="' + (pad.left - 8) + '" y="' + (y + 4) + '" text-anchor="end" fill="#647087" font-size="11">' + tickValue + '</text>');
          }
          const step = labels.length > 1 ? innerW / (labels.length - 1) : innerW;
          const lastLabelStep = Math.max(1, Math.ceil(labels.length / 6));
          labels.forEach((label, index) => {
            if (index % lastLabelStep !== 0 && index !== labels.length - 1) return;
            const x = pad.left + step * index;
            svg.push('<text x="' + x + '" y="' + (height - 12) + '" text-anchor="middle" fill="#647087" font-size="11">' + label.slice(5) + '</text>');
          });
          series.forEach((item) => {
            const points = item.values.map((value, index) => {
              const x = pad.left + step * index;
              const y = pad.top + innerH - (value / max) * innerH;
              return x.toFixed(2) + ',' + y.toFixed(2);
            }).join(' ');
            svg.push('<polyline fill="none" stroke="' + item.color + '" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" points="' + points + '" />');
          });
          svg.push('</svg>');
          const legend = Kit.el('div', { class: 'legend' }, series.map((item) => (
            Kit.el('span', null, [
              Kit.el('i', { class: 'swatch', style: 'background:' + item.color }),
              item.name,
            ])
          )));
          return Kit.el('div', { class: 'chart' }, [
            Kit.el('div', { html: svg.join('') }),
            legend,
          ]);
        },
        heatmap(rows, dayLabels) {
          const values = rows.flatMap((row) => row.values);
          const max = Math.max(1, ...values);
          const root = Kit.el('div', { class: 'heatmap' });
          root.append(Kit.el('div'));
          dayLabels.forEach((label) => root.append(Kit.el('div', { class: 'mono', style: 'text-align:center;' }, label.slice(5))));
          rows.forEach((row) => {
            root.append(Kit.el('div', { class: 'row-label' }, row.label));
            row.values.forEach((value) => {
              const ratio = value / max;
              const color = value === 0
                ? 'rgba(29,36,51,0.05)'
                : 'rgba(0,95,115,' + (0.12 + ratio * 0.8).toFixed(3) + ')';
              root.append(Kit.el('div', { class: 'cell', title: row.label + ' / ' + value, style: 'background:' + color }));
            });
          });
          return root;
        },
        table(columns, rows) {
          if (!rows.length) return Kit.el('p', { class: 'empty' }, '暂无数据');
          const thead = Kit.el('thead', null, Kit.el('tr', null, columns.map((column) => Kit.el('th', null, column.label))));
          const tbody = Kit.el('tbody', null, rows.map((row) => (
            Kit.el('tr', null, columns.map((column) => {
              const rendered = column.render ? column.render(row[column.key], row) : row[column.key];
              return Kit.el('td', null, rendered);
            }))
          )));
          return Kit.el('div', { class: 'table-wrap overflow-x-auto rounded-2xl border border-slate-200/80' }, Kit.el('table', null, [thead, tbody]));
        },
        badge(text, variant) {
          const tone = variant === 'bad'
            ? 'bg-red-100 text-red-700'
            : variant === 'warn'
              ? 'bg-amber-100 text-amber-700'
              : 'bg-cyan-100 text-cyan-800';
          return Kit.el('span', { class: 'badge inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ' + tone }, text);
        },
      };

      const heroCards = [
        ['日志文件', Kit.num(data.inventory.totalFiles)],
        ['日志总量', '${formatBytes(data.inventory.totalBytes)}'],
        ['主结构化窗口', (data.structuredMain.coverage.firstTimestamp || '-').slice(0, 10) + ' → ' + (data.structuredMain.coverage.lastTimestamp || '-').slice(0, 10)],
        ['PM2 原始窗口', (data.rawPm2.coverage.firstTimestamp || '-').slice(0, 10) + ' → ' + (data.rawPm2.coverage.lastTimestamp || '-').slice(0, 10)],
      ];
      heroCards.forEach((entry) => {
        heroMeta.append(Kit.el('div', { class: 'pill rounded-2xl border border-white/20 bg-white/10 p-3 backdrop-blur' }, [
          Kit.el('div', { class: 'label' }, entry[0]),
          Kit.el('div', { class: 'value' }, entry[1]),
        ]));
      });

      const sectionDefs = [
        { id: 'overview', label: '总览', build: buildOverview },
        { id: 'requests', label: '请求', build: buildRequests },
        { id: 'schedule', label: '课程表', build: buildSchedule },
        { id: 'login', label: '登录', build: buildLogin },
        { id: 'cache', label: '缓存', build: buildCache },
        { id: 'credentials', label: '凭证链路', build: buildCredentials },
        { id: 'errors', label: '错误', build: buildErrors },
        { id: 'raw', label: 'PM2 原始流', build: buildRaw },
        { id: 'files', label: '文件清单', build: buildFiles },
      ];

      sectionDefs.forEach((section, index) => {
        const button = Kit.el('button', {
          class: 'rounded-full px-4 py-2 text-sm font-semibold text-slate-500 transition hover:bg-slate-900/10 hover:text-slate-900' + (index === 0 ? ' active bg-slate-900 text-white hover:bg-slate-900 hover:text-white' : ''),
          onclick: () => {
            document.getElementById(section.id).scrollIntoView({ behavior: 'smooth', block: 'start' });
          },
        }, section.label);
        nav.append(button);
        app.append(section.build());
      });

      const observer = new IntersectionObserver((entries) => {
        const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!visible) return;
        const id = visible.target.id;
        Array.from(nav.children).forEach((button) => {
          button.classList.toggle('active', button.textContent === sectionDefs.find((section) => section.id === id).label);
        });
      }, { threshold: 0.2 });
      sectionDefs.forEach((section) => observer.observe(document.getElementById(section.id)));

      function buildOverview() {
        const section = Kit.section('overview', '总览', '这里先看主结构化流的核心规模、峰值、缓存与重认证表现，再说明多流合并的边界。');
        section.append(Kit.el('div', { class: 'grid stats-grid' }, [
          Kit.statCard('主结构化事件', Kit.num(data.structuredMain.totals.events), 'HTTP ' + Kit.num(data.structuredMain.totals.http) + ' · Auth ' + Kit.num(data.structuredMain.totals.auth)),
          Kit.statCard('唯一脱敏用户', Kit.num(data.structuredMain.totals.uniqueUsers), '路径数 ' + Kit.num(data.structuredMain.totals.uniquePaths)),
          Kit.statCard('课程表请求', Kit.num(data.structuredMain.schedule.total), 'Legacy ' + Kit.num(data.structuredMain.schedule.legacy) + ' · V1 ' + Kit.num(data.structuredMain.schedule.v1)),
          Kit.statCard('缓存命中率', Kit.pct(data.structuredMain.cache.hitRate), 'cache-aware ' + Kit.num(data.structuredMain.cache.cacheAwareResponses)),
          Kit.statCard('静默重认证成功率', Kit.pct(data.structuredMain.credentials.reauthSuccessRate), '成功 ' + Kit.num(data.structuredMain.credentials.silentReauth.success || 0)),
          Kit.statCard('去重错误总数', Kit.num(data.unifiedErrors.total), '覆盖天数 ' + Kit.num(data.unifiedErrors.coverage.days)),
        ]));

        section.append(Kit.el('div', { class: 'grid two-col', style: 'margin-top:18px;' }, [
          Kit.card('关键洞察', Kit.el('div', { class: 'note-list' }, data.structuredMain.insights.map((item) => (
            Kit.el('div', { class: 'note' }, [
              Kit.el('strong', null, item.title + '：'),
              ' ' + item.body,
            ])
          )))),
          Kit.card('统计口径说明', Kit.el('div', { class: 'note-list' }, data.meta.notes.map((note) => Kit.el('div', { class: 'note' }, note)))),
        ]));

        const days = data.structuredMain.dailySeries.map((item) => item.day);
        section.append(Kit.el('div', { class: 'grid two-col', style: 'margin-top:18px;' }, [
          Kit.card('主结构化流趋势', Kit.lineChart([
            { name: 'HTTP', color: '#005f73', values: data.structuredMain.dailySeries.map((item) => item.http) },
            { name: 'Auth', color: '#bb3e03', values: data.structuredMain.dailySeries.map((item) => item.auth) },
            { name: 'Warn', color: '#ee9b00', values: data.structuredMain.dailySeries.map((item) => item.warn) },
          ], { labels: days, title: 'structured-main daily' })),
          Kit.card('小时热力图（HTTP / Schedule / Auth）', Kit.heatmap([
            { label: 'HTTP', values: data.structuredMain.hourlySeries.map((item) => item.http) },
            { label: 'Schedule', values: data.structuredMain.hourlySeries.map((item) => item.schedule) },
            { label: 'Auth', values: data.structuredMain.hourlySeries.map((item) => item.auth) },
            { label: 'CacheHit', values: data.structuredMain.hourlySeries.map((item) => item.cacheHit) },
          ], data.structuredMain.hourlySeries.map((item) => 'H' + item.hour))),
        ]));

        section.append(Kit.el('div', { class: 'grid two-col', style: 'margin-top:18px;' }, [
          Kit.card('主消息分布', Kit.barList(data.structuredMain.topMessages.map((item) => ({ label: item.label, count: item.count })))),
          Kit.card('Tag / Message Top', Kit.barList(data.structuredMain.topTags.map((item) => ({ label: item.label, count: item.count })), { kind: 'warn' })),
        ]));
        return section;
      }

      function buildRequests() {
        const section = Kit.section('requests', '请求维度', 'HTTP 请求以结构化主日志为准，重点看路径分布、状态分布、响应时延与匿名用户活跃度。');
        section.append(Kit.el('div', { class: 'grid stats-grid' }, [
          Kit.statCard('HTTP 总量', Kit.num(data.structuredMain.totals.http), '覆盖 ' + Kit.num(data.structuredMain.coverage.days) + ' 天'),
          Kit.statCard('平均响应', Kit.ms(data.structuredMain.http.summary.avg), 'P95 ' + Kit.ms(data.structuredMain.http.summary.p95)),
          Kit.statCard('慢请求 ≥1500ms', Kit.num(data.structuredMain.http.slowBands.ge1500), '最大 ' + Kit.ms(data.structuredMain.http.summary.max)),
          Kit.statCard('常见状态', Object.keys(data.structuredMain.http.statuses).slice(0, 3).join(' / '), '按结构化请求聚合'),
        ]));

        const dailyLabels = data.structuredMain.dailySeries.map((item) => item.day);
        section.append(Kit.el('div', { class: 'grid two-col', style: 'margin-top:18px;' }, [
          Kit.card('请求 / 缓存 / 慢请求趋势', Kit.lineChart([
            { name: 'HTTP', color: '#005f73', values: data.structuredMain.dailySeries.map((item) => item.http) },
            { name: 'CacheHit', color: '#0a9396', values: data.structuredMain.dailySeries.map((item) => item.cacheHit) },
            { name: 'Slow>=1500ms', color: '#ae2012', values: data.structuredMain.dailySeries.map((item) => item.slow1500) },
          ], { labels: dailyLabels, title: 'request trend' })),
          Kit.card('Method / Status / Source', Kit.el('div', { class: 'grid three-col' }, [
            Kit.card('Method', Kit.barList(Object.entries(data.structuredMain.http.methods).map(([label, count]) => ({ label, count })))),
            Kit.card('Status Class', Kit.barList(Object.entries(data.structuredMain.http.statusClass).map(([label, count]) => ({ label, count })))),
            Kit.card('Source', Kit.barList(Object.entries(data.structuredMain.http.sources).map(([label, count]) => ({ label, count })))),
          ])),
        ]));

        section.append(Kit.card('Top 路径', Kit.table([
          { key: 'key', label: 'Path', render: (value) => Kit.el('code', null, value) },
          { key: 'count', label: 'Count', render: (value) => Kit.num(value) },
          { key: 'share', label: 'Share', render: (value) => Kit.pct(value) },
          { key: 'avg', label: 'Avg', render: (value) => Kit.ms(value) },
          { key: 'p95', label: 'P95', render: (value) => Kit.ms(value) },
          { key: 'max', label: 'Max', render: (value) => Kit.ms(value) },
          { key: 'cacheHitRate', label: 'Cache Hit', render: (value) => value ? Kit.pct(value) : Kit.badge('N/A') },
          { key: 'users', label: 'Users', render: (value) => Kit.num(value) },
        ], data.structuredMain.http.pathTable.slice(0, 18))));

        section.append(Kit.el('div', { class: 'grid two-col', style: 'margin-top:18px;' }, [
          Kit.card('最慢请求样本', Kit.table([
            { key: 'timestamp', label: 'Timestamp', render: (value) => Kit.el('span', { class: 'mono' }, value.replace('T', ' ').slice(0, 19)) },
            { key: 'path', label: 'Path', render: (value) => Kit.el('code', null, value) },
            { key: 'ms', label: 'Latency', render: (value) => Kit.badge(Kit.ms(value), value >= 5000 ? 'bad' : 'warn') },
            { key: 'status', label: 'Status' },
            { key: 'source', label: 'Source', render: (value) => Kit.badge(value || 'none') },
            { key: 'alias', label: 'User', render: (value) => value ? Kit.el('code', null, value) : Kit.badge('ANON') },
          ], data.structuredMain.http.topSlow.slice(0, 16))),
          Kit.card('活跃匿名用户', Kit.table([
            { key: 'alias', label: 'Alias', render: (value) => Kit.el('code', null, value) },
            { key: 'http', label: 'HTTP', render: (value) => Kit.num(value) },
            { key: 'schedule', label: 'Schedule', render: (value) => Kit.num(value) },
            { key: 'login', label: 'Login', render: (value) => Kit.num(value) },
            { key: 'cacheHitRate', label: 'Cache Hit', render: (value) => Kit.pct(value) },
            { key: 'p95Ms', label: 'P95', render: (value) => Kit.ms(value) },
          ], data.structuredMain.topUsers.slice(0, 14))),
        ]));
        return section;
      }

      function buildSchedule() {
        const section = Kit.section('schedule', '课程表业务', '聚焦 "/api/schedule" 与 "/api/v1/schedule"，看访问规模、缓存命中、回源来源和慢请求样本。');
        section.append(Kit.el('div', { class: 'grid stats-grid' }, [
          Kit.statCard('课程表请求', Kit.num(data.structuredMain.schedule.total), 'Legacy ' + Kit.num(data.structuredMain.schedule.legacy) + ' · V1 ' + Kit.num(data.structuredMain.schedule.v1)),
          Kit.statCard('课程表命中率', Kit.pct(data.structuredMain.schedule.cacheHitRate), 'cache-aware ' + Kit.num(data.structuredMain.schedule.cacheAware)),
          Kit.statCard('匿名用户数', Kit.num(data.structuredMain.schedule.uniqueUsers), '来自结构化主流'),
          Kit.statCard('P95 / Max', Kit.ms(data.structuredMain.schedule.summary.p95), 'Max ' + Kit.ms(data.structuredMain.schedule.summary.max)),
        ]));

        const labels = data.structuredMain.dailySeries.map((item) => item.day);
        section.append(Kit.el('div', { class: 'grid two-col', style: 'margin-top:18px;' }, [
          Kit.card('课程表趋势', Kit.lineChart([
            { name: 'Schedule HTTP', color: '#005f73', values: data.structuredMain.dailySeries.map((item) => item.scheduleHttp) },
            { name: 'SessionExpired', color: '#ee9b00', values: data.structuredMain.dailySeries.map((item) => item.sessionExpired) },
            { name: 'GET_SCHEDULE_FAILED', color: '#ae2012', values: data.structuredMain.dailySeries.map((item) => item.getScheduleFailed) },
          ], { labels, title: 'schedule trend' })),
          Kit.card('课程表来源', Kit.barList(Object.entries(data.structuredMain.schedule.sources).map(([label, count]) => ({ label, count })))),
        ]));

        const schedulePaths = data.structuredMain.http.pathTable.filter((item) => item.key === '/api/schedule' || item.key === '/api/v1/schedule');
        section.append(Kit.card('课程表路径对比', Kit.table([
          { key: 'key', label: 'Path', render: (value) => Kit.el('code', null, value) },
          { key: 'count', label: 'Count', render: (value) => Kit.num(value) },
          { key: 'cacheHitRate', label: 'Cache Hit', render: (value) => Kit.pct(value) },
          { key: 'avg', label: 'Avg', render: (value) => Kit.ms(value) },
          { key: 'p95', label: 'P95', render: (value) => Kit.ms(value) },
          { key: 'max', label: 'Max', render: (value) => Kit.ms(value) },
          { key: 'slow1500', label: 'Slow>=1500ms', render: (value) => Kit.num(value) },
        ], schedulePaths)));

        section.append(Kit.el('div', { class: 'grid two-col', style: 'margin-top:18px;' }, [
          Kit.card('课程表慢请求样本', Kit.table([
            { key: 'timestamp', label: 'Timestamp', render: (value) => Kit.el('span', { class: 'mono' }, value.replace('T', ' ').slice(0, 19)) },
            { key: 'alias', label: 'User', render: (value) => value ? Kit.el('code', null, value) : Kit.badge('ANON') },
            { key: 'path', label: 'Path', render: (value) => Kit.el('code', null, value) },
            { key: 'ms', label: 'Latency', render: (value) => Kit.badge(Kit.ms(value), value >= 5000 ? 'bad' : 'warn') },
            { key: 'source', label: 'Source', render: (value) => Kit.badge(value || 'none') },
          ], data.structuredMain.schedule.topSlow.slice(0, 14))),
          Kit.card('课程表相关告警日序列', Kit.heatmap([
            { label: 'Schedule', values: data.structuredMain.dailySeries.map((item) => item.scheduleHttp) },
            { label: 'SessExp', values: data.structuredMain.dailySeries.map((item) => item.sessionExpired) },
            { label: 'JW Retry', values: data.structuredMain.dailySeries.map((item) => item.jwRetry) },
            { label: 'Fallback', values: data.structuredMain.dailySeries.map((item) => item.refreshFallback) },
          ], data.structuredMain.dailySeries.map((item) => item.day))),
        ]));
        return section;
      }

      function buildLogin() {
        const section = Kit.section('login', '登录业务', '把 "/auth/login" 的 HTTP 明细和 "auth" 事件合并看，区分主动登录、验证码分支、静默刷新与静默重认证。');
        section.append(Kit.el('div', { class: 'grid stats-grid' }, [
          Kit.statCard('登录 HTTP', Kit.num(data.structuredMain.login.httpTotal), '失败率 ' + Kit.pct(data.structuredMain.login.httpFailureRate)),
          Kit.statCard('脱敏登录用户', Kit.num(data.structuredMain.login.uniqueUsers), '来自 HTTP detail.username'),
          Kit.statCard('最常见结果', (data.structuredMain.login.authDurationTable[0]?.key || 'N/A'), '按 auth 事件聚合'),
          Kit.statCard('验证码相关', Kit.num((data.structuredMain.login.detailResults['captcha-required'] || 0) + (data.structuredMain.login.authResults['需要验证码'] || 0)), 'detail / auth 双视角'),
        ]));

        section.append(Kit.el('div', { class: 'grid three-col', style: 'margin-top:18px;' }, [
          Kit.card('HTTP 结果码', Kit.barList(Object.entries(data.structuredMain.login.httpStatuses).map(([label, count]) => ({ label, count })))),
          Kit.card('HTTP 明细结果', Kit.barList(Object.entries(data.structuredMain.login.detailResults).map(([label, count]) => ({ label, count })), { kind: 'warn' })),
          Kit.card('Auth 分类', Kit.barList(data.structuredMain.login.authDurationTable.map((item) => ({ label: item.key, count: item.count })), { kind: 'bad' })),
        ]));

        section.append(Kit.el('div', { class: 'grid two-col', style: 'margin-top:18px;' }, [
          Kit.card('登录模式 / Captcha / PortalToken', Kit.el('div', { class: 'grid three-col' }, [
            Kit.card('Mode', Kit.barList(Object.entries(data.structuredMain.login.modes).map(([label, count]) => ({ label, count })))),
            Kit.card('Has Captcha', Kit.barList(Object.entries(data.structuredMain.login.hasCaptcha).map(([label, count]) => ({ label, count })))),
            Kit.card('Portal Token', Kit.barList(Object.entries(data.structuredMain.login.portalToken).map(([label, count]) => ({ label, count })))),
          ])),
          Kit.card('登录 Auth 时延', Kit.table([
            { key: 'key', label: 'Auth Kind', render: (value) => Kit.el('code', null, value) },
            { key: 'count', label: 'Count', render: (value) => Kit.num(value) },
            { key: 'avg', label: 'Avg', render: (value) => Kit.ms(value) },
            { key: 'p95', label: 'P95', render: (value) => Kit.ms(value) },
            { key: 'max', label: 'Max', render: (value) => Kit.ms(value) },
          ], data.structuredMain.login.authDurationTable.slice(0, 16))),
        ]));
        return section;
      }

      function buildCache() {
        const section = Kit.section('cache', '缓存业务', '这里仅统计日志中可识别为 cache-aware 的响应，即带 "cached" / "source" 元数据的请求。');
        section.append(Kit.el('div', { class: 'grid stats-grid' }, [
          Kit.statCard('cache-aware 响应', Kit.num(data.structuredMain.cache.cacheAwareResponses), '带 cached/source 元数据'),
          Kit.statCard('命中次数', Kit.num(data.structuredMain.cache.cacheHits), '命中率 ' + Kit.pct(data.structuredMain.cache.hitRate)),
          Kit.statCard('回退缓存事件', Kit.num(data.structuredMain.cache.refreshFallback), '陈旧用户 ' + Kit.num(data.structuredMain.cache.uniqueStaleUsers)),
          Kit.statCard('课程表命中率', Kit.pct(data.structuredMain.schedule.cacheHitRate), '课程表 cache-aware ' + Kit.num(data.structuredMain.schedule.cacheAware)),
        ]));

        section.append(Kit.el('div', { class: 'grid two-col', style: 'margin-top:18px;' }, [
          Kit.card('缓存趋势', Kit.lineChart([
            { name: 'CacheAware', color: '#005f73', values: data.structuredMain.dailySeries.map((item) => item.cacheAware) },
            { name: 'CacheHit', color: '#0a9396', values: data.structuredMain.dailySeries.map((item) => item.cacheHit) },
            { name: 'RefreshFallback', color: '#bb3e03', values: data.structuredMain.dailySeries.map((item) => item.refreshFallback) },
          ], { labels: data.structuredMain.dailySeries.map((item) => item.day), title: 'cache trend' })),
          Kit.card('回退缓存来源', Kit.barList(Object.entries(data.structuredMain.cache.refreshFallbackSource).map(([label, count]) => ({ label, count })), { kind: 'warn' })),
        ]));

        const cachePaths = data.structuredMain.http.pathTable.filter((item) => item.cacheAware > 0).slice(0, 18);
        section.append(Kit.card('缓存感知路径', Kit.table([
          { key: 'key', label: 'Path', render: (value) => Kit.el('code', null, value) },
          { key: 'count', label: 'Count', render: (value) => Kit.num(value) },
          { key: 'cacheAware', label: 'CacheAware', render: (value) => Kit.num(value) },
          { key: 'cacheHit', label: 'Hit', render: (value) => Kit.num(value) },
          { key: 'cacheHitRate', label: 'Hit Rate', render: (value) => Kit.pct(value) },
          { key: 'sources', label: 'Source Top', render: (_value, row) => row.sources.slice(0, 2).map((item) => item.label + ' ' + item.count).join(' · ') || '-' },
        ], cachePaths)));

        section.append(Kit.card('缓存观察说明', Kit.el('div', { class: 'note-list', style: 'margin-top:18px;' }, [
          Kit.el('div', { class: 'note' }, '日志口径只能看出请求是否命中缓存以及回源来源，无法直接从日志恢复缓存 TTL 或缓存表大小。'),
          Kit.el('div', { class: 'note' }, 'RefreshFallback 代表回源失败后仍返回缓存数据，这是“可用性优先”的兜底信号。'),
          Kit.el('div', { class: 'note' }, '课程表链路是当前最主要的缓存消费者，也是缓存命中分析的核心样本。'),
        ])));
        return section;
      }

      function buildCredentials() {
        const section = Kit.section('credentials', '凭证恢复链路', '课程表读数高度依赖凭证链路，这里看 Session 过期、上游重试、静默刷新、静默重认证和步骤成功率。');
        section.append(Kit.el('div', { class: 'grid stats-grid' }, [
          Kit.statCard('Session 过期', Kit.num(Object.values(data.structuredMain.credentials.sessionExpired).reduce((a, b) => a + b, 0)), '按 parser / upstream 记录'),
          Kit.statCard('Upstream 重试', Kit.num(Object.values(data.structuredMain.credentials.upstreamRetry).reduce((a, b) => a + b, 0)), 'jw / portal'),
          Kit.statCard('静默刷新', Kit.num(Object.values(data.structuredMain.credentials.silentRefresh).reduce((a, b) => a + b, 0)), 'JW / Portal'),
          Kit.statCard('静默重认证', Kit.num(Object.values(data.structuredMain.credentials.silentReauth).reduce((a, b) => a + b, 0)), '成功率 ' + Kit.pct(data.structuredMain.credentials.reauthSuccessRate)),
          Kit.statCard('最终失败', Kit.num(Object.values(data.structuredMain.credentials.finalFailures).reduce((a, b) => a + b, 0)), '对客户端暴露'),
          Kit.statCard('冷却跳过', Kit.num(data.structuredMain.credentials.cooldownSkips), 'SilentReAuth cooldown'),
        ]));

        section.append(Kit.el('div', { class: 'grid two-col', style: 'margin-top:18px;' }, [
          Kit.card('凭证链路趋势', Kit.lineChart([
            { name: 'SessionExpired', color: '#ee9b00', values: data.structuredMain.dailySeries.map((item) => item.sessionExpired) },
            { name: 'JW Retry', color: '#bb3e03', values: data.structuredMain.dailySeries.map((item) => item.jwRetry) },
            { name: 'SilentReauth OK', color: '#2a9d8f', values: data.structuredMain.dailySeries.map((item) => item.silentReauthSuccess) },
            { name: 'Credential Final Fail', color: '#ae2012', values: data.structuredMain.dailySeries.map((item) => item.credentialExpired) },
          ], { labels: data.structuredMain.dailySeries.map((item) => item.day), title: 'credential trend' })),
          Kit.card('Session / Retry / Reauth 分类', Kit.el('div', { class: 'grid three-col' }, [
            Kit.card('Session Expired', Kit.barList(Object.entries(data.structuredMain.credentials.sessionExpired).map(([label, count]) => ({ label, count })), { kind: 'warn' })),
            Kit.card('Upstream Retry', Kit.barList(Object.entries(data.structuredMain.credentials.upstreamRetry).map(([label, count]) => ({ label, count })), { kind: 'warn' })),
            Kit.card('Final Failures', Kit.barList(Object.entries(data.structuredMain.credentials.finalFailures).map(([label, count]) => ({ label, count })), { kind: 'bad' })),
          ])),
        ]));

        section.append(Kit.card('步骤成功率', Kit.table([
          { key: 'label', label: 'Step', render: (value) => Kit.el('code', null, value) },
          { key: 'total', label: 'Total', render: (value) => Kit.num(value) },
          { key: 'ok', label: 'OK', render: (value) => Kit.num(value) },
          { key: 'fail', label: 'Fail', render: (value) => Kit.num(value) },
          { key: 'successRate', label: 'Success Rate', render: (value) => Kit.pct(value) },
        ], data.structuredMain.credentials.stepTable.slice(0, 18))));
        return section;
      }

      function buildErrors() {
        const section = Kit.section('errors', '错误流', '错误历史通过 structured-main 与 structured-error 去重合并，重点看错误峰值日、错误签名与业务归因。');
        section.append(Kit.el('div', { class: 'grid stats-grid' }, [
          Kit.statCard('去重错误总数', Kit.num(data.unifiedErrors.total), '覆盖 ' + Kit.num(data.unifiedErrors.coverage.days) + ' 天'),
          Kit.statCard('最常见错误 Tag', data.unifiedErrors.topTags[0]?.label || 'N/A', 'count ' + Kit.num(data.unifiedErrors.topTags[0]?.count || 0)),
          Kit.statCard('最常见错误签名', data.unifiedErrors.topSignatures[0]?.label || 'N/A', 'count ' + Kit.num(data.unifiedErrors.topSignatures[0]?.count || 0)),
          Kit.statCard('原始 PM2 Error 行', Kit.num(data.rawPm2.totals.error), '作为长窗口补充'),
        ]));

        section.append(Kit.el('div', { class: 'grid two-col', style: 'margin-top:18px;' }, [
          Kit.card('错误日趋势', Kit.lineChart([
            { name: 'Unified Error', color: '#ae2012', values: data.unifiedErrors.dailySeries.map((item) => item.error) },
          ], { labels: data.unifiedErrors.dailySeries.map((item) => item.day), title: 'error trend' })),
          Kit.card('Top 错误 Tag', Kit.barList(data.unifiedErrors.topTags.map((item) => ({ label: item.label, count: item.count })), { kind: 'bad' })),
        ]));

        section.append(Kit.card('Top 错误签名', Kit.table([
          { key: 'label', label: 'Signature', render: (value) => Kit.el('code', null, value) },
          { key: 'count', label: 'Count', render: (value) => Kit.num(value) },
        ], data.unifiedErrors.topSignatures.slice(0, 18))));
        return section;
      }

      function buildRaw() {
        const section = Kit.section('raw', 'PM2 原始流', 'PM2 原始日志覆盖时间更长，能补足 structured-main 出现之前的早期阶段，但统计单独展示以避免与结构化流重复。');
        section.append(Kit.el('div', { class: 'grid stats-grid' }, [
          Kit.statCard('原始总行数', Kit.num(data.rawPm2.totals.lines), 'HTTP ' + Kit.num(data.rawPm2.totals.http) + ' · Error ' + Kit.num(data.rawPm2.totals.error)),
          Kit.statCard('覆盖窗口', (data.rawPm2.coverage.firstTimestamp || '-').slice(0, 10) + ' → ' + (data.rawPm2.coverage.lastTimestamp || '-').slice(0, 10), '连续 ' + Kit.num(data.rawPm2.coverage.days) + ' 天'),
          Kit.statCard('唯一路径数', Kit.num(data.rawPm2.totals.uniquePaths), '来自 PM2 raw HTTP'),
          Kit.statCard('Raw HTTP P95', Kit.ms(data.rawPm2.http.summary.p95), 'Max ' + Kit.ms(data.rawPm2.http.summary.max)),
        ]));

        section.append(Kit.el('div', { class: 'grid two-col', style: 'margin-top:18px;' }, [
          Kit.card('PM2 原始趋势', Kit.lineChart([
            { name: 'Raw HTTP', color: '#005f73', values: data.rawPm2.dailySeries.map((item) => item.rawHttp) },
            { name: 'Raw Warn', color: '#ee9b00', values: data.rawPm2.dailySeries.map((item) => item.rawWarn) },
            { name: 'Raw Error', color: '#ae2012', values: data.rawPm2.dailySeries.map((item) => item.rawError) },
          ], { labels: data.rawPm2.dailySeries.map((item) => item.day), title: 'pm2 trend' })),
          Kit.card('PM2 原始 Top 路径', Kit.barList(data.rawPm2.http.pathTable.slice(0, 12).map((item) => ({ label: item.key, count: item.count })))),
        ]));

        section.append(Kit.el('div', { class: 'grid two-col', style: 'margin-top:18px;' }, [
          Kit.card('PM2 原始 Warn', Kit.table([
            { key: 'label', label: 'Warn', render: (value) => Kit.el('code', null, value) },
            { key: 'count', label: 'Count', render: (value) => Kit.num(value) },
          ], data.rawPm2.topWarnings.slice(0, 14))),
          Kit.card('PM2 原始 Error', Kit.table([
            { key: 'label', label: 'Error', render: (value) => Kit.el('code', null, value) },
            { key: 'count', label: 'Count', render: (value) => Kit.num(value) },
          ], data.rawPm2.topErrors.slice(0, 14))),
        ]));
        return section;
      }

      function buildFiles() {
        const section = Kit.section('files', '日志文件清单', '文件级视图用于确认轮转情况、体积分布和审计文件配置。');
        section.append(Kit.el('div', { class: 'grid stats-grid' }, [
          Kit.statCard('文件总数', Kit.num(data.inventory.totalFiles), '总量 ${formatBytes(data.inventory.totalBytes)}'),
          Kit.statCard('structured-main', Kit.num(data.inventory.typeCounts['structured-main'] || 0), '主结构化流'),
          Kit.statCard('structured-error', Kit.num(data.inventory.typeCounts['structured-error'] || 0), '错误轮转流'),
          Kit.statCard('PM2', Kit.num((data.inventory.typeCounts['pm2-out'] || 0) + (data.inventory.typeCounts['pm2-error'] || 0)), '原始 stdout / stderr'),
        ]));

        section.append(Kit.el('div', { class: 'grid two-col', style: 'margin-top:18px;' }, [
          Kit.card('最大文件', Kit.table([
            { key: 'name', label: 'File', render: (value) => Kit.el('code', null, value) },
            { key: 'type', label: 'Type' },
            { key: 'sizeLabel', label: 'Size' },
            { key: 'modifiedAt', label: 'Modified', render: (value) => Kit.el('span', { class: 'mono' }, value.replace('T', ' ').slice(0, 19)) },
          ], data.inventory.largestFiles)),
          Kit.card('轮转审计', data.inventory.audits.length
            ? Kit.table([
              { key: 'file', label: 'Audit File', render: (value) => Kit.el('code', null, value) },
              { key: 'keepAmount', label: 'Keep Amount' },
              { key: 'rotatedFiles', label: 'Rotated Files' },
              { key: 'firstRotatedAt', label: 'First Rotated', render: (value) => value ? Kit.el('span', { class: 'mono' }, value.replace('T', ' ').slice(0, 19)) : '-' },
              { key: 'lastRotatedAt', label: 'Last Rotated', render: (value) => value ? Kit.el('span', { class: 'mono' }, value.replace('T', ' ').slice(0, 19)) : '-' },
            ], data.inventory.audits)
            : Kit.el('p', { class: 'empty' }, '无 audit 文件')),
        ]));

        section.append(Kit.el('div', { style: 'margin-top:18px;' }, [
          Kit.el('details', null, [
            Kit.el('summary', null, '展开全部文件清单'),
            Kit.table([
              { key: 'name', label: 'File', render: (value) => Kit.el('code', null, value) },
              { key: 'type', label: 'Type' },
              { key: 'sizeLabel', label: 'Size' },
              { key: 'modifiedAt', label: 'Modified', render: (value) => Kit.el('span', { class: 'mono' }, value.replace('T', ' ').slice(0, 19)) },
            ], data.inventory.files),
          ]),
        ]));
        return section;
      }
    })();
  </script>
</body>
</html>`;
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, renderHtml(report), 'utf8');

console.log(`Generated report: ${outputPath}`);
