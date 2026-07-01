/**
 * [INPUT]: 依赖 Hono、authMiddleware、onAppError、config、success 与各业务子路由模块
 * [OUTPUT]: 对外提供 registerRoutes(app)，统一挂载 public/auth/calendar 与受保护 /api 路由
 * [POS]: routes 的总装配器，定义 /api 认证放行边界、DISABLE_UGC 合规守卫，连接入口 index.ts
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth.middleware';
import { onAppError } from '../middleware/error.middleware';
import { config } from '../config';
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

  // UGC compliance guard — must be on `app` level because Hono sub-app pattern matching
  // uses the mount-prefix-stripped path while c.req.path is full, creating ambiguity.
  if (config.disableUgc) {
    app.use('/api/discover/*', async (c, next) => {
      if (c.req.method === 'GET' && !c.req.path.endsWith('/meta')) return success(c, null);
      await next();
    });
    app.use('/api/treehole/*', async (c, next) => {
      if (c.req.method === 'GET' && !c.req.path.endsWith('/meta')) return success(c, null);
      await next();
    });
  }

  app.route('/api', api);
}
