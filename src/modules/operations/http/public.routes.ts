/**
 * [INPUT]: 依赖 Hono、Operations AnnouncementService/IndexPopupService 与统一响应/错误语义
 * [OUTPUT]: 默认导出 `/api/public` 公告与首页弹窗 Hono 路由
 * [POS]: operations/http 的匿名公共内容适配器，只暴露公告公开视图与当前有效弹窗
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { Hono } from 'hono';
import { ErrorCode } from '../../../utils/errors';
import { error, success } from '../../../utils/response';
import { AnnouncementService } from '../infrastructure/announcement-service';
import { IndexPopupService } from '../infrastructure/index-popup-service';

const publicRoutes = new Hono();

publicRoutes.get('/announcements', async (c) => {
  try {
    return success(c, await AnnouncementService.listPublic());
  } catch (cause: any) {
    return error(c, ErrorCode.INTERNAL_ERROR, cause?.message || '获取公告失败', 500);
  }
});

publicRoutes.get('/index-popup', async (c) => success(c, await IndexPopupService.getPublic()));

export default publicRoutes;
