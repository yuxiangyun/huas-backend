/**
 * [INPUT]: 仅依赖共享 ICourse 数据契约与 node:crypto 的确定性 SHA-1
 * [OUTPUT]: 对外提供北京本周范围、ICS 序列化、订阅 URL、响应头与节次时间纯规则
 * [POS]: calendar/domain 的纯规则核心，不读配置、数据库、网络或应用运行态
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { createHash } from 'node:crypto';
import type { ICourse } from '../../../types';

type SectionSlot = {
  start: string;
  end: string;
};

type CourseTiming = {
  kind: 'timed';
  start: string;
  end: string;
} | {
  kind: 'allDay';
};

export type CalendarUser = {
  id: number;
  studentId: string;
  name?: string;
};

const ICS_LINE_LIMIT_OCTETS = 75;
const ICS_TIMEZONE = 'Asia/Shanghai';
const UTF8_ENCODER = new TextEncoder();

const SECTION_TIME_MAP: Record<number, SectionSlot> = {
  1: { start: '08:00', end: '08:45' },
  2: { start: '08:55', end: '09:40' },
  3: { start: '10:00', end: '10:45' },
  4: { start: '10:55', end: '11:40' },
  5: { start: '14:30', end: '15:15' },
  6: { start: '15:25', end: '16:10' },
  7: { start: '16:30', end: '17:15' },
  8: { start: '17:25', end: '18:10' },
  9: { start: '19:00', end: '19:45' },
  10: { start: '19:55', end: '20:40' },
  11: { start: '20:50', end: '21:35' },
  12: { start: '21:45', end: '22:30' },
};

const BEIJING_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: ICS_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function beijingDate(date: Date): string {
  const parts = Object.fromEntries(BEIJING_DATE_FORMATTER.formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function addDays(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00+08:00`);
  parsed.setDate(parsed.getDate() + days);
  return beijingDate(parsed);
}

function formatIcsUtcStamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

function formatIcsLocalDateTime(date: string, time: string): string {
  return `${date.replace(/-/g, '')}T${time.replace(':', '')}00`;
}

function formatIcsDate(date: string): string {
  return date.replace(/-/g, '');
}

function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');
}

function utf8Length(value: string): number {
  return UTF8_ENCODER.encode(value).byteLength;
}

function utf8PrefixLength(value: string, maxOctets: number): number {
  let octets = 0;
  let length = 0;

  for (const character of value) {
    const characterOctets = utf8Length(character);
    if (octets + characterOctets > maxOctets) break;
    octets += characterOctets;
    length += character.length;
  }

  return length;
}

function foldIcsLine(line: string): string[] {
  if (utf8Length(line) <= ICS_LINE_LIMIT_OCTETS) return [line];

  const lines: string[] = [];
  let remaining = line;
  while (remaining) {
    const continuation = lines.length > 0;
    const contentLimit = ICS_LINE_LIMIT_OCTETS - (continuation ? 1 : 0);
    const prefixLength = utf8PrefixLength(remaining, contentLimit);
    const prefix = remaining.slice(0, prefixLength);
    lines.push(continuation ? ` ${prefix}` : prefix);
    remaining = remaining.slice(prefixLength);
  }
  return lines;
}

function appendLine(lines: string[], line: string): void {
  lines.push(...foldIcsLine(line));
}

function buildEventUid(course: ICourse, studentId: string, date: string): string {
  const digest = createHash('sha1')
    .update([
      studentId,
      date,
      course.section || '',
      course.name || '',
      course.teacher?.trim() || '',
      course.location?.trim() || '',
    ].join('|'))
    .digest('hex');
  return `${digest}@huas-server`;
}

function resolveCourseDate(course: ICourse, weekStart: string): string {
  if (typeof course.weekStr === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(course.weekStr)) {
    return course.weekStr;
  }
  const normalizedDay = Math.min(7, Math.max(1, Number(course.day || 1)));
  return addDays(weekStart, normalizedDay - 1);
}

function resolveCourseTiming(section: string): CourseTiming {
  const match = String(section || '').trim().match(/^(\d{1,2})(?:-(\d{1,2}))?$/);
  if (!match) return { kind: 'allDay' };

  const startSection = Number(match[1]);
  const endSection = Number(match[2] || match[1]);
  const startSlot = SECTION_TIME_MAP[startSection];
  const endSlot = SECTION_TIME_MAP[endSection];

  if (!startSlot || !endSlot || endSection < startSection) return { kind: 'allDay' };
  return { kind: 'timed', start: startSlot.start, end: endSlot.end };
}

export function getCurrentWeekRange(date: Date = new Date()): { startDate: string; endDate: string } {
  const today = beijingDate(date);
  const parsed = new Date(`${today}T00:00:00+08:00`);
  const diffToMonday = (parsed.getDay() + 6) % 7;
  parsed.setDate(parsed.getDate() - diffToMonday);
  const startDate = beijingDate(parsed);
  return { startDate, endDate: addDays(startDate, 6) };
}

export function buildWeeklyScheduleIcs(options: {
  studentId: string;
  name?: string;
  weekStart: string;
  courses: ICourse[];
  generatedAt?: Date;
}): string {
  const generatedAt = options.generatedAt || new Date();
  const calendarName = `${options.name || options.studentId} 本周课表`;
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//HUAS Server//Schedule Calendar//CN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(calendarName)}`,
    `X-WR-TIMEZONE:${ICS_TIMEZONE}`,
    'BEGIN:VTIMEZONE',
    `TZID:${ICS_TIMEZONE}`,
    'BEGIN:STANDARD',
    'DTSTART:19700101T000000',
    'TZOFFSETFROM:+0800',
    'TZOFFSETTO:+0800',
    'TZNAME:CST',
    'END:STANDARD',
    'END:VTIMEZONE',
  ];

  const sortedCourses = [...options.courses].sort((a, b) => {
    const dateA = resolveCourseDate(a, options.weekStart);
    const dateB = resolveCourseDate(b, options.weekStart);
    return dateA !== dateB
      ? dateA.localeCompare(dateB)
      : String(a.section || '').localeCompare(String(b.section || ''));
  });

  for (const course of sortedCourses) {
    const date = resolveCourseDate(course, options.weekStart);
    const timing = resolveCourseTiming(course.section);
    const description = [
      `教师: ${course.teacher?.trim() || '未安排'}`,
      `地点: ${course.location?.trim() || '未安排'}`,
      `节次: ${course.section || '未安排'}`,
      `日期: ${date}`,
    ].join('\n');

    lines.push('BEGIN:VEVENT');
    appendLine(lines, `UID:${buildEventUid(course, options.studentId, date)}`);
    appendLine(lines, `DTSTAMP:${formatIcsUtcStamp(generatedAt)}`);
    appendLine(lines, `SUMMARY:${escapeIcsText(course.name || '课程')}`);

    if (timing.kind === 'timed') {
      appendLine(lines, `DTSTART;TZID=${ICS_TIMEZONE}:${formatIcsLocalDateTime(date, timing.start)}`);
      appendLine(lines, `DTEND;TZID=${ICS_TIMEZONE}:${formatIcsLocalDateTime(date, timing.end)}`);
    } else {
      appendLine(lines, `DTSTART;VALUE=DATE:${formatIcsDate(date)}`);
      appendLine(lines, `DTEND;VALUE=DATE:${formatIcsDate(addDays(date, 1))}`);
    }

    appendLine(lines, `LOCATION:${escapeIcsText(course.location?.trim() || '未安排')}`);
    appendLine(lines, `DESCRIPTION:${escapeIcsText(description)}`);
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return `${lines.join('\r\n')}\r\n`;
}

export function buildEmptyWeeklyScheduleIcs(options: {
  studentId: string;
  name?: string;
  generatedAt?: Date;
}): string {
  return buildWeeklyScheduleIcs({
    studentId: options.studentId,
    name: options.name,
    weekStart: getCurrentWeekRange(options.generatedAt).startDate,
    courses: [],
    generatedAt: options.generatedAt,
  });
}

export function buildCalendarSubscriptionUrl(origin: string, studentId: string, sig: string): string {
  const url = new URL('/calendar/schedule.ics', origin);
  url.searchParams.set('studentId', studentId);
  url.searchParams.set('sig', sig);
  return url.toString();
}

export function getCalendarSubscriptionContentHeaders(): Record<string, string> {
  return {
    'Content-Type': 'text/calendar; charset=utf-8',
    'Content-Disposition': 'inline; filename="schedule.ics"',
    'Cache-Control': 'no-store',
  };
}

export function getSectionTimeMap(): Record<number, SectionSlot> {
  return { ...SECTION_TIME_MAP };
}
