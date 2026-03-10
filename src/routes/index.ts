import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth.middleware';
import { onAppError } from '../middleware/error.middleware';
import authRoutes from './auth/auth.routes';
import scheduleRoutes from './academic/schedule.routes';
import v1ScheduleRoutes from './portal/v1-schedule.routes';
import gradeRoutes from './academic/grade.routes';
import ecardRoutes from './portal/ecard.routes';
import userRoutes from './portal/user.routes';
import healthRoutes from './system/health.routes';
import publicRoutes from './content/public.routes';
import adminRoutes from './admin/admin.routes';
import discoverRoutes from './discover/discover.routes';
import treeholeRoutes from './treehole/treehole.routes';

export function registerRoutes(app: Hono) {
  // Public routes
  app.route('/auth', authRoutes);
  app.route('/health', healthRoutes);

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
  api.route('/ecard', ecardRoutes);
  api.route('/user', userRoutes);
  api.route('/discover', discoverRoutes);
  api.route('/treehole', treeholeRoutes);

  app.route('/api', api);
}
