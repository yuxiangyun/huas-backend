import { Hono } from 'hono';
import { UserService } from '../../services/portal/user-service';
import { success, error } from '../../utils/response';
import { ErrorCode } from '../../utils/errors';
import { appendHttpLogDetail, formatHttpLogDetail } from '../../utils/http-log';

const user = new Hono();

user.get('/', async (c) => {
  const userId = c.get('userId');
  const studentId = c.get('studentId');
  const forceRefresh = c.req.query('refresh') === 'true';

  appendHttpLogDetail(c, formatHttpLogDetail({ refresh: forceRefresh }));
  const result = await UserService.getUserInfo(userId, studentId, forceRefresh);
  if (!result.data) {
    return error(c, ErrorCode.INTERNAL_ERROR, '统一认证中心繁忙，获取失败', 502);
  }
  return success(c, result.data, result._meta);
});

export default user;
