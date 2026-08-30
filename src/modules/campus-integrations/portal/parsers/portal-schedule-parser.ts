/**
 * [INPUT]: 依赖 Portal 上游 JSON、ICourse 类型、Logger 与 portal-code 的 code 语义判断
 * [OUTPUT]: 对外提供 PortalScheduleParser，按请求日期范围解析 Portal 课表，并区分合法空表与缺失载荷
 * [POS]: campus-integrations/portal/parsers 的课表纯适配器，识别过期、协议缺字段、真实空表并过滤日期范围
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import type { ICourse } from '../../../../types';
import { Logger } from '../../../../utils/logger';
import { isPortalSessionExpiredCode, isPortalSuccessCode } from './portal-code';

export const PortalScheduleParser = {
  parse(json: any, startDate?: string, endDate?: string, user?: { studentId?: string; name?: string }) {
    const week = startDate ? `${startDate}` : "日期模式";

    if (isPortalSessionExpiredCode(json?.code) || json?.message?.includes('token') || json?.message?.includes('失效') || json?.message?.includes('过期')) {
      Logger.warn('PortalScheduleParser', 'Session 过期', json?.message);
      throw new Error("SESSION_EXPIRED");
    }

    if (isPortalSuccessCode(json?.code) && !json?.data?.schedule) {
      Logger.warn('PortalScheduleParser', '课表载荷缺失', json?.message || 'data.schedule 缺失', user?.studentId);
      throw new Error('PORTAL_SCHEDULE_PAYLOAD_MISSING');
    }

    if (!isPortalSuccessCode(json?.code) || !json?.data?.schedule) {
      Logger.warn('PortalScheduleParser', '数据获取失败', json?.message || '未知错误');
      if (json?.message?.includes('暂未公布') || json?.message?.includes('没有相关数据') || json?.message?.includes('获取失败adapter-server')) {
        throw new Error("SCHEDULE_NOT_AVAILABLE");
      }
      throw new Error(json?.message || "GET_SCHEDULE_FAILED");
    }

    const courses: ICourse[] = [];
    const schedule = json.data.schedule;
    const rangeStart = startDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate) ? startDate : null;
    const defaultEnd = rangeStart
      ? new Date(new Date(`${rangeStart}T00:00:00Z`).getTime() + 6 * 86_400_000).toISOString().slice(0, 10)
      : null;
    const rangeEnd = endDate && /^\d{4}-\d{2}-\d{2}$/.test(endDate) ? endDate : defaultEnd;

    for (const dateStr of Object.keys(schedule)) {
      if (rangeStart && rangeEnd && (dateStr < rangeStart || dateStr > rangeEnd)) continue;
      const dateObj = new Date(`${dateStr}T00:00:00Z`);
      if (Number.isNaN(dateObj.getTime())) continue;
      const dayOfWeek = dateObj.getUTCDay() || 7;

      const dayData = schedule[dateStr];
      if (dayData && Array.isArray(dayData.calendarList)) {
        for (const item of dayData.calendarList) {
          const remark = item.remark || '';
          let teacher = '未知';
          let section = '';

          const teacherMatch = remark.match(/任课教师:(.*?)(;|$)/);
          if (teacherMatch) teacher = teacherMatch[1].trim();

          const sectionMatch = remark.match(/节次:(\d+)-(\d+)节/);
          if (sectionMatch) {
            const start = parseInt(sectionMatch[1], 10);
            const end = parseInt(sectionMatch[2], 10);
            section = `${start}-${end}`;
          }

          if (item.title && section) {
            courses.push({
              name: item.title,
              location: item.address || '未安排',
              day: dayOfWeek,
              section,
              teacher,
              // weekStr 契约是周次文本；Portal 源没有周次，置空串由前端隐藏该栏，
              // 日期事实已由 day（请求日期推导）承载，不再用日期串冒充周次
              weekStr: ''
            });
          }
        }
      }
    }

    Logger.parser('PortalScheduleParser', `解析完成 共 ${courses.length} 个日程`, user?.studentId, user?.name);
    return { week, courses };
  }
};
