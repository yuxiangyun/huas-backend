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

export function registerRoutes(app: Hono) {
  // Public routes
  app.route('/auth', authRoutes);
  app.route('/health', healthRoutes);

  // Protected API routes
  const api = new Hono();
  api.onError(onAppError);
  api.use('*', authMiddleware);
  api.route('/schedule', scheduleRoutes);
  api.route('/v1/schedule', v1ScheduleRoutes);
  api.route('/grades', gradeRoutes);
  api.route('/ecard', ecardRoutes);
  api.route('/user', userRoutes);

  app.route('/api', api);
}
