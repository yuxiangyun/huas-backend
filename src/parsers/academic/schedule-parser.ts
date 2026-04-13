import * as cheerio from 'cheerio';
import type { ICourse } from '../../types';
import { Logger } from '../../utils/logger';
import { SESSION_EXPIRED_INDICATORS } from '../../config';

const LI_SHOW_WEEK_CALL_RE = /\$\(\s*(["'])#li_showWeek\1\s*\)\.html\(\s*(?:"((?:\\.|[^"\\])*)"|'((?:\\.|[^'\\])*)')\s*\);?/g;
const FIELD_MAP: Record<string, keyof Pick<ICourse, 'name' | 'teacher' | 'location' | 'weekStr'>> = {
  "课程名称": "name",
  "教师": "teacher",
  "任课教师": "teacher",
  "上课地点": "location",
  "上课时间": "weekStr",
};

function decodeInlineHtml(source: string): string {
  return source
    .replace(/\\"/g, '"')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function stripTags(source: string): string {
  return decodeInlineHtml(source)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractLiShowWeekMessages(html: string): string[] {
  const messages: string[] = [];
  const regex = new RegExp(LI_SHOW_WEEK_CALL_RE);
  let match: RegExpExecArray | null;

  while ((match = regex.exec(html))) {
    const text = stripTags(match[2] || match[3] || '');
    if (text) messages.push(text);
  }

  return messages;
}

function extractWeek(html: string, $: cheerio.CheerioAPI): string {
  const messages = extractLiShowWeekMessages(html);
  for (let i = messages.length - 1; i >= 0; i--) {
    const weekMatch = messages[i].match(/第\d+周/);
    if (weekMatch) return weekMatch[0];
  }

  let week = "未知";
  $('script').each((_, el) => {
    const text = $(el).html() || '';
    const match = text.match(/li_showWeek.*?(第\d+周)/);
    if (match) week = match[1];
  });
  return week;
}

function extractSection(source: string): string {
  const normalized = source.replace(/\s+/g, ' ');
  const rowMatch = normalized.match(/\((\d{1,2})\s*,\s*(\d{1,2})小节\)/);
  if (rowMatch) {
    return `${Number(rowMatch[1])}-${Number(rowMatch[2])}`;
  }

  const titleMatch = normalized.match(/\[(\d{1,2})-(\d{1,2})\]节/);
  if (titleMatch) {
    return `${Number(titleMatch[1])}-${Number(titleMatch[2])}`;
  }

  return '';
}

function parseCourseFields(source: string): { name: string; teacher: string; location: string; weekStr: string } {
  const course = {
    name: '',
    teacher: '',
    location: '',
    weekStr: '',
  };

  decodeInlineHtml(source)
    .split(/<br\s*\/?>|\r?\n/i)
    .map((part) => stripTags(part))
    .filter(Boolean)
    .forEach((part) => {
      const index = part.search(/[:：]/);
      if (index < 0) return;

      const label = part.slice(0, index).trim();
      const value = part.slice(index + 1).trim();
      const key = FIELD_MAP[label];
      if (!key) return;

      course[key] = value;
    });

  return course;
}

export const ScheduleParser = {
  parse(html: string, user?: { studentId?: string; name?: string }) {
    const rawHtml = html || '';
    const htmlStart = rawHtml.substring(0, 500);
    const liShowWeekMessages = extractLiShowWeekMessages(rawHtml);
    const latestLiShowWeek = liShowWeekMessages[liShowWeekMessages.length - 1] || '';
    const redirectToCas = /window\.location\.href\s*=\s*['"][^'"]*cas\/login/i.test(rawHtml);
    const matchedIndicator = SESSION_EXPIRED_INDICATORS.find((indicator) => htmlStart.includes(indicator));

    if (!rawHtml.trim()) {
      Logger.warn('ScheduleParser', 'Session 过期', 'HTML为空');
      throw new Error("SESSION_EXPIRED");
    }

    if (redirectToCas || (!rawHtml.includes('kb_table') && matchedIndicator)) {
      Logger.warn('ScheduleParser', 'Session 过期', `检测到: "${matchedIndicator || 'CAS redirect'}"`);
      throw new Error("SESSION_EXPIRED");
    }

    const $ = cheerio.load(rawHtml);
    const week = extractWeek(rawHtml, $);

    if (latestLiShowWeek.includes('当前日期不在教学周历内')) {
      Logger.warn('ScheduleParser', '非教学周', latestLiShowWeek);
      return { week: '暂无', courses: [], message: '当前日期不在教学周历内' };
    }

    if (rawHtml.includes('课表暂未公布') || latestLiShowWeek.includes('课表暂未公布')) {
      Logger.warn('ScheduleParser', '课表未公布', '教务系统提示课表暂未公布');
      return { week: '暂无', courses: [], message: '课表暂未公布' };
    }

    if (!rawHtml.includes('kb_table')) {
      Logger.warn('ScheduleParser', '课表解析失败', `无效的课表HTML，长度: ${rawHtml.length}`);
      throw new Error("GET_SCHEDULE_FAILED");
    }

    const courses: ICourse[] = [];

    $('table.kb_table tbody tr').each((_, row) => {
      const cells = $(row).find('td');
      if (cells.length < 2) return;

      const rowHeader = $(cells[0]).html() || $(cells[0]).text();
      const rowSection = extractSection(rowHeader);

      for (let day = 1; day <= 7 && day < cells.length; day++) {
        $(cells[day]).find('p[title], div.kb_content[title], p:not([title]), div.kb_content:not([title])').each((_, item) => {
          const title = ($(item).attr('title') || '').trim();
          const visibleName = $(item).text().replace(/\s+/g, ' ').trim();
          if (!title && !visibleName) return;

          const parsed = parseCourseFields(title);
          const section = rowSection || extractSection(parsed.weekStr);
          const name = parsed.name || visibleName;
          if (!name || !section) return;

          courses.push({
            name,
            teacher: parsed.teacher || '',
            location: parsed.location || '',
            day,
            section,
            weekStr: parsed.weekStr || '',
          });
        });
      }
    });

    Logger.parser('ScheduleParser', `解析完成 周:${week} 共 ${courses.length} 门课`, user?.studentId, user?.name);
    return { week, courses, message: '' };
  }
};
