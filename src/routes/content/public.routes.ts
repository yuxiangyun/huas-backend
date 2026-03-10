import { Hono } from 'hono';
import { success, error } from '../../utils/response';
import { ErrorCode } from '../../utils/errors';
import { AnnouncementService } from '../../services/content/announcement-service';

const publicRoutes = new Hono();

publicRoutes.get('/announcements', async (c) => {
  try {
    const data = await AnnouncementService.listPublic();
    return success(c, data);
  } catch (e: any) {
    return error(c, ErrorCode.INTERNAL_ERROR, e?.message || '获取公告失败', 500);
  }
});

export default publicRoutes;
