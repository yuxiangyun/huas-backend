import { Hono } from 'hono';
import { AppError, ErrorCode } from '../../../utils/errors';
import { isBodyLimitError, requestBodyLimit } from '../../../utils/request-body-limit';
import { success } from '../../../utils/response';
import type { ScheduleShareApplicationService } from '../application/schedule-share-service';
import { isPreferredScheduleSource } from '../domain/schedule-source-policy';
import { scheduleShareRateLimit } from './schedule-share-rate-limit';

export function createScheduleShareRoutes(service: ScheduleShareApplicationService) {
  const authenticated = new Hono();
  authenticated.use('*', scheduleShareRateLimit('create'));
  authenticated.use('*', requestBodyLimit({ maxSize: 1024, tooLargeMessage: '分享请求过大' }));
  authenticated.post('/', async (c) => {
    let input: unknown;
    try { input = await c.req.json(); } catch (cause) {
      if (isBodyLimitError(cause)) throw cause;
      throw new AppError(ErrorCode.PARAM_ERROR, '请提供有效的 JSON 请求');
    }
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new AppError(ErrorCode.PARAM_ERROR, '分享请求格式错误');
    const body = input as Record<string, unknown>;
    if (Object.keys(body).some((key) => key !== 'date' && key !== 'preferred_source')) throw new AppError(ErrorCode.PARAM_ERROR, '分享请求包含无效字段');
    if (typeof body.date !== 'string') throw new AppError(ErrorCode.PARAM_ERROR, '请选择要分享的课表日期');
    if (body.preferred_source !== undefined && !isPreferredScheduleSource(body.preferred_source)) {
      throw new AppError(ErrorCode.PARAM_ERROR, '课表来源无效，请选择智慧文理移动教务或学校教务网站');
    }
    return success(c, await service.create(c.get('userId'), body.date, body.preferred_source));
  });

  const publicRead = new Hono();
  publicRead.use('*', scheduleShareRateLimit('read'));
  publicRead.get('/', async (c) => success(c, await service.read(c.req.header('X-Schedule-Share-Token'))));
  return { authenticated, publicRead };
}
