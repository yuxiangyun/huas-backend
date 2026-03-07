import { Hono } from 'hono';
import { GradeService } from '../services/grade-service';
import { success } from '../utils/response';

const grades = new Hono();

grades.get('/', async (c) => {
  const userId = c.get('userId');
  const studentId = c.get('studentId');
  const query = c.req.query();
  const forceRefresh = c.req.query('refresh') === 'true';

  const result = await GradeService.getGrades(userId, studentId, query, forceRefresh);
  return success(c, result.data, result._meta);
});

export default grades;
