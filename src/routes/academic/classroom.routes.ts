import { Hono } from 'hono';
import { academicRefreshRateLimitMiddleware } from '../../middleware/academic-refresh-rate-limit.middleware';
import { ClassroomFreeService } from '../../services/academic/classroom-free-service';
import { success } from '../../utils/response';

const classrooms = new Hono();

classrooms.use('*', academicRefreshRateLimitMiddleware);

classrooms.get('/buildings', async (c) => {
  const result = await ClassroomFreeService.getBuildings(c.req.query('campusId'), {
    userId: c.get('userId'),
    studentId: c.get('studentId'),
    name: c.get('name'),
  });
  return success(c, result.data, result._meta);
});

classrooms.get('/free', async (c) => {
  const result = await ClassroomFreeService.getFreeRooms(c.req.query(), {
    userId: c.get('userId'),
    studentId: c.get('studentId'),
    name: c.get('name'),
  });
  return success(c, result.data, result._meta);
});

export default classrooms;
