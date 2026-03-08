const BEIJING_TIME_ZONE = 'Asia/Shanghai';

// Force runtime timezone to Beijing to avoid host-level timezone drift.
process.env.TZ = BEIJING_TIME_ZONE;

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

export const config = {
  port: Number(process.env.PORT) || 3000,
  jwtSecret: process.env.JWT_SECRET || 'huas-server-default-secret-change-me',
  dbPath: process.env.DB_PATH || './data/huas.db',
  timeZone: BEIJING_TIME_ZONE,

  // Credential TTLs (school-side, short-lived)
  ttl: {
    tgc: 24 * 60 * 60 * 1000,            // TGC: ~24 hours (school CAS actual)
    portalJwt: 10 * 60 * 1000,           // Portal JWT: ~10 minutes
    jwSession: 10 * 60 * 1000,           // JW Session: ~10 minutes
    selfJwt: 90 * 24 * 60 * 60 * 1000,   // Self JWT: 90 days
  },

  // Cache TTLs (seconds)
  cacheTtl: {
    schedule: 0,               // manual refresh only
    grades: 0,                 // manual refresh only
    ecard: 0,                  // manual refresh only
    user: 0,                   // manual refresh only
  },

  // Cache limits
  cacheLimit: {
    gradesPerUser: parsePositiveInt(process.env.GRADES_CACHE_LIMIT, 20),
    schedulePerUser: parsePositiveInt(process.env.SCHEDULE_CACHE_LIMIT, 120),
    portalSchedulePerUser: parsePositiveInt(process.env.PORTAL_SCHEDULE_CACHE_LIMIT, 120),
  },

  // Request timeouts (ms)
  timeout: {
    cas: 3000,      // CAS auth requests
    business: 5000, // Business data requests
  },

  // Retry settings
  retry: {
    jwActivationMax: 3,       // JW SSO activation max attempts
    jwActivationDelay: 500,   // ms between retries
    businessMaxAttempts: parsePositiveInt(process.env.BUSINESS_RETRY_MAX_ATTEMPTS, 2),
    businessBaseDelayMs: parsePositiveInt(process.env.BUSINESS_RETRY_BASE_DELAY_MS, 200),
    businessMaxDelayMs: parsePositiveInt(process.env.BUSINESS_RETRY_MAX_DELAY_MS, 800),
    businessJitterMs: parsePositiveInt(process.env.BUSINESS_RETRY_JITTER_MS, 100),
  },

  // Pre-login captcha session
  captchaSessionTtl: 10 * 60 * 1000,  // 10 minutes

  // Cleanup interval
  cleanupInterval: 60 * 60 * 1000,    // 1 hour
};

// Shared constants
export const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';

export const JW_SJMS_VALUE = '94CA0081978330A1E05320001AAC856E';

export const PORTAL_HEADERS = {
  'X-Device-Info': 'PC',
  'X-Terminal-Info': 'PC',
  'Origin': 'https://portal.huas.edu.cn',
  'Referer': 'https://portal.huas.edu.cn/main.html',
} as const;

// Session expiry indicators (shared by HTML parsers)
export const SESSION_EXPIRED_INDICATORS = [
  '用户登录', 'cas/login', 'cas.huas.edu.cn', '请重新登录',
  '会话超时', 'top.location.href', 'sso.jsp', 'parent.location',
  'window.location.href',
];
