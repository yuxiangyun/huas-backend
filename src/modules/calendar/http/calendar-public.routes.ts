/**
 * [INPUT]: 依赖 Hono、Calendar 默认应用装配与统一错误响应
 * [OUTPUT]: 对外默认提供公开 `/schedule.ics` Hono 路由及原有 ICS 响应契约
 * [POS]: calendar/http 的公开订阅协议适配器，只校验查询参数并映射应用结果
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { Hono } from 'hono';
import { ErrorCode } from '../../../utils/errors';
import { error } from '../../../utils/response';
import { defaultCalendarApplication } from '../infrastructure/calendar-composition';

const calendarPublic = new Hono();

calendarPublic.get('/schedule.ics', async (c) => {
  const studentId = c.req.query('studentId')?.trim();
  const sig = c.req.query('sig')?.trim();
  if (!studentId || !sig) {
    return error(c, ErrorCode.PARAM_ERROR, 'Missing studentId or sig parameter', 400);
  }

  const result = await defaultCalendarApplication.resolveSubscription(studentId, sig);
  if (result.kind === 'missing-secret') {
    return error(c, ErrorCode.INTERNAL_ERROR, 'CALENDAR_SECRET 未配置', 500);
  }
  if (result.kind === 'invalid-signature') {
    return error(c, ErrorCode.JWT_INVALID, 'Invalid calendar signature', 401);
  }
  if (result.kind === 'user-not-found') {
    return error(c, ErrorCode.JWT_INVALID, 'User no longer exists, please login again', 401);
  }
  return new Response(result.ics, { headers: result.headers });
});

export default calendarPublic;
