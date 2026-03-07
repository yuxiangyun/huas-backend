import { Hono } from 'hono';
import { authMiddleware } from '../middleware/auth.middleware';
import { onAppError } from '../middleware/error.middleware';
import authRoutes from './auth.routes';
import scheduleRoutes from './schedule.routes';
import v1ScheduleRoutes from './v1-schedule.routes';
import gradeRoutes from './grade.routes';
import ecardRoutes from './ecard.routes';
import userRoutes from './user.routes';
import healthRoutes from './health.routes';
import publicRoutes from './public.routes';
import adminRoutes from './admin.routes';

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

  app.route('/api', api);
}
