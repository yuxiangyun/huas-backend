/**
 * [INPUT]: 依赖 Portal 上游 JSON、ICourse 类型、Logger 与 portal-code 的 code 语义判断
 * [OUTPUT]: 对外提供 PortalScheduleParser，按请求日期范围解析 Portal 课表，并区分合法空表与缺失载荷
 * [POS]: campus-integrations/portal/parsers 的课表纯适配器，严格校验日期映射、列表与课程结构，保留独立 date，拒绝静默漏课并过滤日期范围
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import type { ICourse } from '../../../../types';
import { Logger } from '../../../../utils/logger';
import { isPortalSessionExpiredCode, isPortalSuccessCode } from './portal-code';

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseDate(value: string): Date {
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error('PORTAL_SCHEDULE_PAYLOAD_INVALID');
  }
  return parsed;
}

export const PortalScheduleParser = {
  parse(json: any, startDate?: string, endDate?: string, user?: { studentId?: string; name?: string }) {
    const week = startDate ? `${startDate}` : "日期模式";

    const message = typeof json?.message === 'string' ? json.message : '';

    if (isPortalSessionExpiredCode(json?.code) || message.includes('token') || message.includes('失效') || message.includes('过期')) {
      Logger.warn('PortalScheduleParser', 'Session 过期', json?.message);
      throw new Error("SESSION_EXPIRED");
    }

    if (isPortalSuccessCode(json?.code) && !json?.data?.schedule) {
      Logger.warn('PortalScheduleParser', '课表载荷缺失', json?.message || 'data.schedule 缺失', user?.studentId);
      throw new Error('PORTAL_SCHEDULE_PAYLOAD_MISSING');
    }

    if (!isPortalSuccessCode(json?.code) || !json?.data?.schedule) {
      Logger.warn('PortalScheduleParser', '数据获取失败', json?.message || '未知错误');
      if (message.includes('暂未公布') || message.includes('没有相关数据') || message.includes('获取失败adapter-server')) {
        throw new Error("SCHEDULE_NOT_AVAILABLE");
      }
      throw new Error(json?.message || "GET_SCHEDULE_FAILED");
    }

    const courses: ICourse[] = [];
    const schedule = json.data.schedule;
    if (!isRecord(schedule)) throw new Error('PORTAL_SCHEDULE_PAYLOAD_INVALID');
    const rangeStart = startDate && /^\d{4}-\d{2}-\d{2}$/.test(startDate) ? startDate : null;
    const defaultEnd = rangeStart
      ? new Date(new Date(`${rangeStart}T00:00:00Z`).getTime() + 6 * 86_400_000).toISOString().slice(0, 10)
      : null;
    const rangeEnd = endDate && /^\d{4}-\d{2}-\d{2}$/.test(endDate) ? endDate : defaultEnd;

    for (const [dateStr, dayData] of Object.entries(schedule)) {
      const dateObj = parseDate(dateStr);
      if (!isRecord(dayData) || !Array.isArray(dayData.calendarList)) {
        throw new Error('PORTAL_SCHEDULE_PAYLOAD_INVALID');
      }
      const dayOfWeek = dateObj.getUTCDay() || 7;
      for (const item of dayData.calendarList) {
        if (!isRecord(item) || typeof item.title !== 'string' || !item.title.trim()
          || typeof item.remark !== 'string'
          || (item.address != null && typeof item.address !== 'string')) {
          throw new Error('PORTAL_SCHEDULE_PAYLOAD_INVALID');
        }
        const teacherMatch = item.remark.match(/任课教师[:：]\s*(.*?)(?:[;；]|$)/);
        const sectionMatch = item.remark.match(/节次[:：]\s*(\d+)\s*-\s*(\d+)\s*节/);
        const firstSection = Number(sectionMatch?.[1]);
        const lastSection = Number(sectionMatch?.[2]);
        if (!sectionMatch || !Number.isSafeInteger(firstSection) || !Number.isSafeInteger(lastSection)
          || firstSection < 1 || lastSection < firstSection) {
          throw new Error('PORTAL_SCHEDULE_PAYLOAD_INVALID');
        }
        if (rangeStart && rangeEnd && (dateStr < rangeStart || dateStr > rangeEnd)) continue;
        courses.push({
          name: item.title.trim(),
          location: item.address?.trim() || '未安排',
          day: dayOfWeek,
          date: dateStr,
          section: `${firstSection}-${lastSection}`,
          teacher: teacherMatch?.[1].trim() || '未知',
          // Portal 提供独立日期事实，不用日期串冒充周次文本。
          weekStr: '',
        });
      }
    }

    Logger.parser('PortalScheduleParser', `解析完成 共 ${courses.length} 个日程`, user?.studentId, user?.name);
    return { week, courses };
  }
};
