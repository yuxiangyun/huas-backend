import type { ICourse } from '../types';
import { Logger } from '../utils/logger';

export const PortalScheduleParser = {
  parse(json: any, startDate?: string, user?: { studentId?: string; name?: string }) {
    if (json?.code === 401 || json?.message?.includes('token') || json?.message?.includes('失效') || json?.message?.includes('过期')) {
      Logger.warn('PortalScheduleParser', 'Session 过期', json?.message);
      throw new Error("SESSION_EXPIRED");
    }

    if (json?.code !== 0 || !json?.data?.schedule) {
      Logger.warn('PortalScheduleParser', '数据获取失败', json?.message || '未知错误');
      if (json?.message?.includes('暂未公布') || json?.message?.includes('没有相关数据') || json?.message?.includes('获取失败adapter-server')) {
        throw new Error("SCHEDULE_NOT_AVAILABLE");
      }
      throw new Error(json?.message || "GET_SCHEDULE_FAILED");
    }

    const courses: ICourse[] = [];
    const schedule = json.data.schedule;
    const week = startDate ? `${startDate}` : "日期模式";

    for (const dateStr of Object.keys(schedule)) {
      const dateObj = new Date(`${dateStr}T00:00:00Z`);
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
              weekStr: dateStr
            });
          }
        }
      }
    }

    Logger.parser('PortalScheduleParser', `解析完成 共 ${courses.length} 个日程`, user?.studentId, user?.name);
    return { week, courses };
  }
};
