/**
 * [INPUT]: 依赖 Hono、authMiddleware、onAppError、稳定校园子路由与注入的 Community/Discover/Treehole/Notifications/Messaging/Social 摘要/后台 routes
 * [OUTPUT]: 对外提供 registerRoutes(app, dependencies)，统一挂载 public/auth/calendar 与受保护 /api 路由
 * [POS]: routes 的协议总装配器，只定义 URL/认证边界并挂载跨 Social 只读聚合，不创建业务 concrete singleton
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth.middleware';
import { onAppError } from '../middleware/error.middleware';
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
import calendarApiRoutes from './calendar/calendar-api.routes';
import calendarPublicRoutes from './calendar/calendar-public.routes';

export interface RouteDependencies {
  adminRoutes: Hono;
  communityRoutes: Hono;
  discoverRoutes: Hono;
  messagingRoutes: Hono;
  notificationRoutes: Hono;
  socialSummaryRoutes: Hono;
  treeholeRoutes: Hono;
}

export function registerRoutes(app: Hono, dependencies: RouteDependencies): void;
export function registerRoutes(app: Hono, dependencies?: RouteDependencies) {
  // Public routes
  app.route('/auth', authRoutes);
  app.route('/health', healthRoutes);
  app.route('/calendar', calendarPublicRoutes);

  // API routes
  const api = new Hono();
  api.onError(onAppError);
  api.route('/public', publicRoutes);
  if (dependencies) api.route('/admin', dependencies.adminRoutes);
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

  if (dependencies) {
    api.route('/community', dependencies.communityRoutes);
    api.route('/discover', dependencies.discoverRoutes);
    api.route('/messaging', dependencies.messagingRoutes);
    api.route('/notifications', dependencies.notificationRoutes);
    api.route('/social', dependencies.socialSummaryRoutes);
    api.route('/treehole', dependencies.treeholeRoutes);
  }
  api.route('/calendar', calendarApiRoutes);

  app.route('/api', api);
}
