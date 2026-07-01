/**
 * [INPUT]: 依赖 Hono、authMiddleware、onAppError、config、ugcComplianceState、success 与各业务子路由模块
 * [OUTPUT]: 对外提供 registerRoutes(app)，统一挂载 public/auth/calendar 与受保护 /api 路由
 * [POS]: routes 的总装配器，定义 /api 认证放行边界、UGC 运行态认证后空读守卫，连接入口 index.ts
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { Hono, type Context, type Next } from 'hono';
import { authMiddleware } from '../middleware/auth.middleware';
import { onAppError } from '../middleware/error.middleware';
import { config } from '../config';
import { ugcComplianceState, type UgcComplianceStatus } from '../runtime/ugc-compliance-state';
import { success } from '../utils/response';
import authRoutes from './auth/auth.routes';
import scheduleRoutes from './academic/schedule.routes';
import v1ScheduleRoutes from './portal/v1-schedule.routes';
import gradeRoutes from './academic/grade.routes';
import evaluationRoutes from './academic/evaluation.routes';
import classroomRoutes from './academic/classroom.routes';
import ecardRoutes from './portal/ecard.routes';
import userRoutes from './portal/user.routes';
import healthRoutes from './system/health.routes';
import publicRoutes from './content/public.routes';
import adminRoutes from './admin/admin.routes';
import discoverRoutes from './discover/discover.routes';
import treeholeRoutes from './treehole/treehole.routes';
import calendarApiRoutes from './calendar/calendar-api.routes';
import calendarPublicRoutes from './calendar/calendar-public.routes';

const DISCOVER_DEFAULT_PAGE_SIZE = 20;
const DISCOVER_MAX_PAGE_SIZE = 50;
const EMPTY_TREEHOLE_AVATAR = { avatarUrl: null } as const;
const EMPTY_TREEHOLE_UNREAD_COUNT = { unreadCount: 0 } as const;
const MOCK_POST_ID = 0;

function readPositiveInt(value: string | undefined, fallback: number, max: number) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.floor(n), max);
}

function emptyPage(c: Context, defaultPageSize: number, maxPageSize: number, items: unknown[] = []) {
  const page = readPositiveInt(c.req.query('page'), 1, Number.MAX_SAFE_INTEGER);
  return {
    items: page === 1 ? items : [],
    page,
    pageSize: readPositiveInt(c.req.query('pageSize'), defaultPageSize, maxPageSize),
    total: items.length,
    hasMore: false,
  };
}

function mockDiscoverPost(state: UgcComplianceStatus) {
  return {
    id: MOCK_POST_ID,
    title: state.discoverMockText.slice(0, 24),
    storeName: '',
    priceText: '',
    content: state.discoverMockText,
    category: '其他',
    tags: [],
    images: [],
    coverUrl: '',
    imageCount: 0,
    commentCount: 0,
    rating: {
      average: 0,
      count: 0,
      total: 0,
      userScore: null,
    },
    author: {
      id: 0,
      label: '',
    },
    isMine: false,
    publishedAt: state.updatedAt,
    createdAt: state.updatedAt,
    updatedAt: state.updatedAt,
  };
}

function mockTreeholePost(state: UgcComplianceStatus) {
  return {
    id: MOCK_POST_ID,
    content: state.treeholeMockText,
    avatarUrl: null,
    stats: {
      likeCount: 0,
      commentCount: 0,
    },
    viewer: {
      liked: false,
      isMine: false,
    },
    publishedAt: state.updatedAt,
    createdAt: state.updatedAt,
    updatedAt: state.updatedAt,
  };
}

function discoverCompliancePayload(c: Context, state: UgcComplianceStatus) {
  const path = c.req.path;
  if (path.endsWith('/comments')) {
    return emptyPage(c, config.discover.defaultCommentPageSize, config.discover.maxCommentPageSize);
  }
  if (path.endsWith('/posts')) {
    return emptyPage(c, DISCOVER_DEFAULT_PAGE_SIZE, DISCOVER_MAX_PAGE_SIZE, state.discoverMockText ? [mockDiscoverPost(state)] : []);
  }
  if (path.endsWith('/posts/me')) {
    return emptyPage(c, DISCOVER_DEFAULT_PAGE_SIZE, DISCOVER_MAX_PAGE_SIZE);
  }
  if (path.endsWith(`/posts/${MOCK_POST_ID}`) && state.discoverMockText) {
    return mockDiscoverPost(state);
  }
  return null;
}

function treeholeCompliancePayload(c: Context, state: UgcComplianceStatus) {
  const path = c.req.path;
  if (path.endsWith('/comments')) {
    return emptyPage(c, config.treehole.defaultCommentPageSize, config.treehole.maxCommentPageSize);
  }
  if (path.endsWith('/posts')) {
    return emptyPage(c, config.treehole.defaultPageSize, config.treehole.maxPageSize, state.treeholeMockText ? [mockTreeholePost(state)] : []);
  }
  if (path.endsWith('/posts/me')) {
    return emptyPage(c, config.treehole.defaultPageSize, config.treehole.maxPageSize);
  }
  if (path.endsWith(`/posts/${MOCK_POST_ID}`) && state.treeholeMockText) {
    return mockTreeholePost(state);
  }
  if (path.endsWith('/avatar')) return EMPTY_TREEHOLE_AVATAR;
  if (path.endsWith('/notifications/unread-count')) return EMPTY_TREEHOLE_UNREAD_COUNT;
  return null;
}

async function ugcComplianceGuard(
  c: Context,
  next: Next,
  payloadOf: (c: Context, state: UgcComplianceStatus) => unknown
) {
  const state = ugcComplianceState.status();
  if (state.mode !== 'compliance' || c.req.method !== 'GET' || c.req.path.endsWith('/meta')) return next();

  const authFailure = await authMiddleware(c, async () => undefined);
  if (authFailure) return authFailure;

  return success(c, payloadOf(c, state));
}

export function registerRoutes(app: Hono) {
  // Public routes
  app.route('/auth', authRoutes);
  app.route('/health', healthRoutes);
  app.route('/calendar', calendarPublicRoutes);

  // API routes
  const api = new Hono();
  api.onError(onAppError);
  api.route('/public', publicRoutes);
  api.route('/admin', adminRoutes);
  api.use('*', (c, next) => {
    const path = c.req.path;
    if (
      path === '/api/public'
      || path.startsWith('/api/public/')
      || path === '/api/admin'
      || path.startsWith('/api/admin/')
      || path === '/public'
      || path.startsWith('/public/')
      || path === '/admin'
      || path.startsWith('/admin/')
    ) {
      return next();
    }
    return authMiddleware(c, next);
  });
  api.route('/schedule', scheduleRoutes);
  api.route('/v1/schedule', v1ScheduleRoutes);
  api.route('/grades', gradeRoutes);
  api.route('/evaluations', evaluationRoutes);
  api.route('/classrooms', classroomRoutes);
  api.route('/ecard', ecardRoutes);
  api.route('/user', userRoutes);

  api.route('/discover', discoverRoutes);
  api.route('/treehole', treeholeRoutes);
  api.route('/calendar', calendarApiRoutes);

  // UGC 合规守卫必须在 app 层：Hono 子应用匹配会剥离挂载前缀，但 c.req.path 保持完整路径。
  app.use('/api/discover/*', (c, next) => ugcComplianceGuard(c, next, discoverCompliancePayload));
  app.use('/api/treehole/*', (c, next) => ugcComplianceGuard(c, next, treeholeCompliancePayload));

  app.route('/api', api);
}
