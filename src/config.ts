/**
 * [INPUT]: 依赖 process.env 与 node:path，读取端口、密钥、数据库、缓存、课表来源策略、四类社交媒体/孤儿宽限期、Treehole 低内存压缩门禁、服务账号、限流、成绩、mobile-yxt 与 mobile-jw 回源总预算及上游超时
 * [OUTPUT]: 对外提供 config、USER_AGENT 等运行时配置常量，并强制 TZ 为 Asia/Shanghai
 * [POS]: src 的配置源，所有模块通过它读取运行参数，避免散落读取环境变量
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { dirname, join } from 'node:path';

const BEIJING_TIME_ZONE = 'Asia/Shanghai';
const DEFAULT_DB_PATH = './data/huas.db';
const CALENDAR_SECRET = process.env.CALENDAR_SECRET?.trim() || '';
const CALENDAR_TOKEN_SECRET_FILE = process.env.CALENDAR_TOKEN_SECRET_FILE?.trim() || '';
const MIB = 1024 * 1024;
const DEFAULT_DISCOVER_IMAGE_MAX_BYTES = 32 * MIB;
const DEFAULT_COMMUNITY_AVATAR_MAX_BYTES = 2 * MIB;
const DEFAULT_TREEHOLE_IMAGE_MAX_BYTES = 12 * MIB;
const DEFAULT_TREEHOLE_IMAGE_TOTAL_MAX_BYTES = 32 * MIB;
const DEFAULT_TREEHOLE_IMAGE_MAX_OUTPUT_BYTES = MIB;
const DEFAULT_TREEHOLE_IMAGE_MAX_PIXELS = 16_000_000;
const DEFAULT_TREEHOLE_IMAGE_MAX_DIMENSION = 1_280;

// Force runtime timezone to Beijing to avoid host-level timezone drift.
process.env.TZ = BEIJING_TIME_ZONE;

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.floor(n);
}

function parseNonNegativeInt(value: string | undefined, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.floor(n);
}

export const config = {
  port: Number(process.env.PORT) || 3000,
  jwtSecret: process.env.JWT_SECRET || 'huas-server-default-secret-change-me',
  dbPath: process.env.DB_PATH || DEFAULT_DB_PATH,
  timeZone: BEIJING_TIME_ZONE,
  server: {
    idleTimeoutSeconds: Math.min(parsePositiveInt(process.env.SERVER_IDLE_TIMEOUT_SECONDS, 60), 255),
  },
  authLoginRateLimit: {
    maxFailures: parsePositiveInt(process.env.AUTH_LOGIN_RATE_LIMIT_MAX_FAILURES, 20),
    windowMs: parsePositiveInt(process.env.AUTH_LOGIN_RATE_LIMIT_WINDOW_MS, 5 * 60 * 1000),
    blockMs: parsePositiveInt(process.env.AUTH_LOGIN_RATE_LIMIT_BLOCK_MS, 10 * 60 * 1000),
  },

  schoolService: {
    classroomAdminStudentId: process.env.CLASSROOM_ADMIN_STUDENT_ID?.trim() || '',
  },

  scheduleSourcePolicy: {
    environmentMode: process.env.SCHEDULE_SOURCE_MODE?.trim() || '',
    stateFile: process.env.SCHEDULE_SOURCE_POLICY_FILE?.trim()
      || join(dirname(process.env.DB_PATH || DEFAULT_DB_PATH), 'schedule-source-policy.json'),
  },

  // Credential TTLs (school-side)
  ttl: {
    tgc: 7 * 24 * 60 * 60 * 1000,        // TGC: 7 days (local TTL)
    portalJwt: 7 * 24 * 60 * 60 * 1000,  // Portal JWT: 7 days (local TTL)
    jwSession: 7 * 24 * 60 * 60 * 1000,  // JW Session: 7 days (local TTL)
    selfJwt: 90 * 24 * 60 * 60 * 1000,   // Self JWT: 90 days
  },

  // Cache TTLs (seconds)
  // 语义约定：0 = 永久缓存（读路径直接命中，仅 refresh=true 回源；refresh 失败仍可经 allowExpired
  // 提供 stale 兜底）。四项均为有意选择：客户端负责在需要新数据时显式带 refresh 参数。
  cacheTtl: {
    schedule: 0,               // 周键分段，永久缓存 + 手动刷新
    grades: 0,                 // 学期键分段，永久缓存 + 手动刷新
    ecard: 0,                  // 永久缓存 + 手动刷新，客户端刷新页面时显式 refresh
    user: 0,                   // 永久缓存 + 手动刷新，客户端刷新页面时显式 refresh
  },

  // Cache limits
  cacheLimit: {
    gradesPerUser: parsePositiveInt(process.env.GRADES_CACHE_LIMIT, 20),
    schedulePerUser: parsePositiveInt(process.env.SCHEDULE_CACHE_LIMIT, 120),
    portalSchedulePerUser: parsePositiveInt(process.env.PORTAL_SCHEDULE_CACHE_LIMIT, 120),
  },

  // Request timeouts (ms)
  timeout: {
    cas: 2000,      // CAS auth requests（更快暴露失败，交给有界重试兜底）
    business: 4000, // Business data requests（覆盖学校上游慢请求主区间，失败交重试兜底）
    gradeFreshBudget: 45_000, // Fresh grades include bounded credential recovery and upstream retries
    mobileYxtTotalBudget: 20_000, // 单个 mobile-yxt 只读调用包含凭证派生与一次会话重建的总预算
    mobileJwTotalBudget: 45_000, // 移动教务课表只读调用包含 Portal 恢复、SSO 与一次失效重建的总预算
  },

  // Retry settings
  retry: {
    jwActivationMax: 3,       // JW SSO activation max attempts
    jwActivationDelay: 150,   // ms between retries（激活失败多为会话态问题，快速再试比长等待划算）
    businessMaxAttempts: parsePositiveInt(process.env.BUSINESS_RETRY_MAX_ATTEMPTS, 2),
    businessBaseDelayMs: parsePositiveInt(process.env.BUSINESS_RETRY_BASE_DELAY_MS, 200),
    businessMaxDelayMs: parsePositiveInt(process.env.BUSINESS_RETRY_MAX_DELAY_MS, 800),
    businessJitterMs: parsePositiveInt(process.env.BUSINESS_RETRY_JITTER_MS, 100),
  },

  // Pre-login captcha session
  captchaSessionTtl: 10 * 60 * 1000,  // 10 minutes

  // Cleanup interval
  cleanupInterval: 60 * 60 * 1000,    // 1 hour

  calendar: {
    baseUrl: process.env.CALENDAR_BASE_URL?.trim() || '',
    secret: CALENDAR_SECRET,
    tokenSecret: CALENDAR_SECRET,
    tokenSecretFile: CALENDAR_TOKEN_SECRET_FILE,
  },

  discover: {
    storageRoot: process.env.DISCOVER_STORAGE_ROOT || join(dirname(process.env.DB_PATH || DEFAULT_DB_PATH), 'discover'),
    mediaBasePath: process.env.DISCOVER_MEDIA_BASE_PATH || '/media/discover',
    maxImagesPerPost: parsePositiveInt(process.env.DISCOVER_MAX_IMAGES, 9),
    maxTagsPerPost: parsePositiveInt(process.env.DISCOVER_MAX_TAGS, 6),
    maxTitleLength: parsePositiveInt(process.env.DISCOVER_MAX_TITLE_LENGTH, 80),
    maxTagLength: parsePositiveInt(process.env.DISCOVER_MAX_TAG_LENGTH, 12),
    maxStoreNameLength: parsePositiveInt(process.env.DISCOVER_MAX_STORE_NAME_LENGTH, 32),
    maxPriceTextLength: parsePositiveInt(process.env.DISCOVER_MAX_PRICE_TEXT_LENGTH, 20),
    maxContentLength: parsePositiveInt(process.env.DISCOVER_MAX_CONTENT_LENGTH, 400),
    maxCommentLength: parsePositiveInt(process.env.DISCOVER_MAX_COMMENT_LENGTH, 200),
    defaultCommentPageSize: parsePositiveInt(process.env.DISCOVER_DEFAULT_COMMENT_PAGE_SIZE, 50),
    maxCommentPageSize: parsePositiveInt(process.env.DISCOVER_MAX_COMMENT_PAGE_SIZE, 100),
    recommendationCandidateLimit: parsePositiveInt(
      process.env.DISCOVER_RECOMMENDATION_CANDIDATE_LIMIT,
      1000,
    ),
    imageMaxBytes: parsePositiveInt(process.env.DISCOVER_IMAGE_MAX_BYTES, DEFAULT_DISCOVER_IMAGE_MAX_BYTES),
    imageMaxDimension: parsePositiveInt(process.env.DISCOVER_IMAGE_MAX_DIMENSION, 1280),
    imageQuality: Math.min(95, Math.max(40, parsePositiveInt(process.env.DISCOVER_IMAGE_QUALITY, 78))),
    orphanMediaGraceMs: parsePositiveInt(
      process.env.DISCOVER_ORPHAN_MEDIA_GRACE_MS,
      60 * 60 * 1000,
    ),
  },

  community: {
    avatarStorageRoot: process.env.COMMUNITY_AVATAR_STORAGE_ROOT
      || join(dirname(process.env.DB_PATH || DEFAULT_DB_PATH), 'treehole-avatars'),
    avatarMediaBasePath: process.env.COMMUNITY_AVATAR_MEDIA_BASE_PATH
      || '/media/treehole-avatar',
    avatarMaxBytes: parsePositiveInt(
      process.env.COMMUNITY_AVATAR_MAX_BYTES,
      DEFAULT_COMMUNITY_AVATAR_MAX_BYTES,
    ),
    avatarMaxDimension: parsePositiveInt(process.env.COMMUNITY_AVATAR_MAX_DIMENSION, 512),
    avatarQuality: Math.min(95, Math.max(40, parsePositiveInt(process.env.COMMUNITY_AVATAR_QUALITY, 78))),
    orphanMediaGraceMs: parsePositiveInt(
      process.env.COMMUNITY_AVATAR_ORPHAN_GRACE_MS,
      60 * 60 * 1000,
    ),
  },

  treehole: {
    storageRoot: process.env.TREEHOLE_STORAGE_ROOT
      || join(dirname(process.env.DB_PATH || DEFAULT_DB_PATH), 'treehole-post-media'),
    userMediaBasePath: process.env.TREEHOLE_USER_MEDIA_BASE_PATH || '/api/treehole/media',
    adminMediaBasePath: process.env.TREEHOLE_ADMIN_MEDIA_BASE_PATH || '/api/admin/treehole/media',
    maxPostLength: parsePositiveInt(process.env.TREEHOLE_MAX_POST_LENGTH, 500),
    maxCommentLength: parsePositiveInt(process.env.TREEHOLE_MAX_COMMENT_LENGTH, 200),
    defaultPageSize: parsePositiveInt(process.env.TREEHOLE_DEFAULT_PAGE_SIZE, 20),
    maxPageSize: parsePositiveInt(process.env.TREEHOLE_MAX_PAGE_SIZE, 50),
    defaultCommentPageSize: parsePositiveInt(process.env.TREEHOLE_DEFAULT_COMMENT_PAGE_SIZE, 50),
    maxCommentPageSize: parsePositiveInt(process.env.TREEHOLE_MAX_COMMENT_PAGE_SIZE, 100),
    maxImagesPerPost: Math.min(9, parsePositiveInt(process.env.TREEHOLE_MAX_IMAGES, 9)),
    imageMaxBytes: Math.min(
      DEFAULT_TREEHOLE_IMAGE_MAX_BYTES,
      parsePositiveInt(process.env.TREEHOLE_IMAGE_MAX_BYTES, DEFAULT_TREEHOLE_IMAGE_MAX_BYTES),
    ),
    imageTotalMaxBytes: Math.min(
      DEFAULT_TREEHOLE_IMAGE_TOTAL_MAX_BYTES,
      parsePositiveInt(
        process.env.TREEHOLE_IMAGE_TOTAL_MAX_BYTES,
        DEFAULT_TREEHOLE_IMAGE_TOTAL_MAX_BYTES,
      ),
    ),
    imageMaxPixels: Math.min(
      DEFAULT_TREEHOLE_IMAGE_MAX_PIXELS,
      parsePositiveInt(process.env.TREEHOLE_IMAGE_MAX_PIXELS, DEFAULT_TREEHOLE_IMAGE_MAX_PIXELS),
    ),
    imageMaxOutputBytes: Math.min(
      DEFAULT_TREEHOLE_IMAGE_MAX_OUTPUT_BYTES,
      parsePositiveInt(
        process.env.TREEHOLE_IMAGE_MAX_OUTPUT_BYTES,
        DEFAULT_TREEHOLE_IMAGE_MAX_OUTPUT_BYTES,
      ),
    ),
    imageMaxDimension: Math.min(
      DEFAULT_TREEHOLE_IMAGE_MAX_DIMENSION,
      parsePositiveInt(
        process.env.TREEHOLE_IMAGE_MAX_DIMENSION,
        DEFAULT_TREEHOLE_IMAGE_MAX_DIMENSION,
      ),
    ),
    imageQuality: Math.min(90, Math.max(40, parsePositiveInt(process.env.TREEHOLE_IMAGE_QUALITY, 78))),
    orphanMediaGraceMs: parsePositiveInt(
      process.env.TREEHOLE_ORPHAN_MEDIA_GRACE_MS,
      60 * 60 * 1000,
    ),
    uploadMaxActive: Math.min(2, parsePositiveInt(process.env.TREEHOLE_UPLOAD_MAX_ACTIVE, 1)),
    uploadMaxQueued: Math.min(8, parseNonNegativeInt(process.env.TREEHOLE_UPLOAD_MAX_QUEUED, 2)),
  },
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
