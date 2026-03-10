import * as cheerio from 'cheerio';
import type { ICourse } from '../../types';
import { Logger } from '../../utils/logger';
import { SESSION_EXPIRED_INDICATORS } from '../../config';

export const ScheduleParser = {
  parse(html: string, user?: { studentId?: string; name?: string }) {
    const htmlStart = (html || '').substring(0, 500);

    if (html && html.includes('课表暂未公布')) {
      Logger.warn('ScheduleParser', '课表未公布', '教务系统提示课表暂未公布');
      throw new Error("SCHEDULE_NOT_AVAILABLE");
    }

    if (!html || html.length < 100) {
      Logger.warn('ScheduleParser', 'Session 过期', `HTML太短: ${html?.length || 0}`);
      throw new Error("SESSION_EXPIRED");
    }

    const matchedIndicator = SESSION_EXPIRED_INDICATORS.find(i => htmlStart.includes(i));
    if (matchedIndicator) {
      Logger.warn('ScheduleParser', 'Session 过期', `检测到: "${matchedIndicator}"`);
      throw new Error("SESSION_EXPIRED");
    }

    if (!html.includes('kb_table')) {
      Logger.warn('ScheduleParser', 'Session 过期', `无效的课表HTML，长度: ${html.length}`);
      throw new Error("SESSION_EXPIRED");
    }

    const $ = cheerio.load(html);
    let week = "未知";
    $('script').each((_, el) => {
      const txt = $(el).html() || '';
      const m = txt.match(/li_showWeek.*?>(.*?)<|li_showWeek.*?'(.*?)'/);
      if (m) week = m[1] || m[2] || week;
    });

    const courses: ICourse[] = [];
    const fieldMap: Record<string, string> = {
      "课程名称": "name", "上课地点": "location",
      "教师": "teacher", "上课时间": "weekStr"
    };

    $('table.kb_table tbody tr').each((_, row) => {
      const cells = $(row).find('td');
      if (!cells.length) return;
      const section = $(cells[0]).text().trim().split(' ')[0];

      for (let day = 1; day <= 7; day++) {
        $(cells[day]).find('div.kb_content, p[title]').each((_, item) => {
          const title = $(item).attr('title');
          if (!title) return;
          const course: any = { day, section };
          title.split(/<br\s*\/?>|\n/i).forEach(part => {
            const idx = part.indexOf('：');
            if (idx > -1) {
              const key = fieldMap[part.substring(0, idx).trim()] || 'unknown';
              course[key] = part.substring(idx + 1).trim();
            }
          });
          if (course.name) courses.push(course);
        });
      }
    });

    Logger.parser('ScheduleParser', `解析完成 周:${week} 共 ${courses.length} 门课`, user?.studentId, user?.name);
    return { week, courses };
  }
};
