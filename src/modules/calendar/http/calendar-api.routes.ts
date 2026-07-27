/**
 * [INPUT]: 依赖 Hono、Calendar 默认应用装配与统一错误/成功响应
 * [OUTPUT]: 对外默认提供 Bearer `/link` Hono 路由，返回稳定的订阅 URL/studentId/sig
 * [POS]: calendar/http 的登录态协议适配器，只读认证上下文并映射应用结果
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { Hono } from 'hono';
import { ErrorCode } from '../../../utils/errors';
import { error, success } from '../../../utils/response';
import { defaultCalendarApplication } from '../infrastructure/calendar-composition';

const calendarApi = new Hono();

calendarApi.get('/link', (c) => {
  const result = defaultCalendarApplication.createSubscriptionLink(c.get('studentId'));
  if (result.kind === 'missing-base-url') {
    return error(c, ErrorCode.INTERNAL_ERROR, 'CALENDAR_BASE_URL 未配置', 500);
  }
  if (result.kind === 'missing-secret') {
    return error(c, ErrorCode.INTERNAL_ERROR, 'CALENDAR_SECRET 未配置', 500);
  }
  return success(c, { url: result.url, studentId: result.studentId, sig: result.sig });
});

export default calendarApi;
