import { Hono } from 'hono';
import { ECardService } from '../services/ecard-service';
import { success, error } from '../utils/response';
import { ErrorCode } from '../utils/errors';

const ecard = new Hono();

ecard.get('/', async (c) => {
  const userId = c.get('userId');
  const studentId = c.get('studentId');
  const forceRefresh = c.req.query('refresh') === 'true';

  const result = await ECardService.getECard(userId, studentId, forceRefresh);
  if (!result.data) {
    return error(c, ErrorCode.INTERNAL_ERROR, '一卡通服务系统忙，请稍后重试', 502);
  }
  return success(c, result.data, result._meta);
});

export default ecard;
