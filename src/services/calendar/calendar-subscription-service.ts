/**
 * [INPUT]: 依赖数据库用户、ScheduleFacade 双源周课表、ICourse、北京时间与 node:crypto
 * [OUTPUT]: 提供订阅用户解析、当前周课表、RFC 5545 ICS、订阅 URL 与响应头构造能力
 * [POS]: services/calendar 的订阅编排与序列化核心，复用双源门面并以 15 分钟窗口刷新周快照
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { getDb, schema } from '../../db';
import { ScheduleFacade } from '../academic/schedule-facade';
import type { ICourse } from '../../types';
import { beijingDate } from '../../utils/time';

type SectionSlot = {
  start: string;
  end: string;
};

type CalendarUser = {
  id: number;
  studentId: string;
  name?: string;
};

type CourseTiming = {
  kind: 'timed';
  start: string;
  end: string;
} | {
  kind: 'allDay';
};

const ICS_LINE_LIMIT_OCTETS = 75;
const ICS_TIMEZONE = 'Asia/Shanghai';
const UTF8_ENCODER = new TextEncoder();
const CALENDAR_SNAPSHOT_MAX_AGE_MS = 15 * 60 * 1000;

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
  const dayOffset = normalizedDay - 1;
  return addDays(weekStart, dayOffset);
}

function resolveCourseTiming(section: string): CourseTiming {
  const match = String(section || '').trim().match(/^(\d{1,2})(?:-(\d{1,2}))?$/);
  if (!match) return { kind: 'allDay' };

  const startSection = Number(match[1]);
  const endSection = Number(match[2] || match[1]);
  const startSlot = SECTION_TIME_MAP[startSection];
  const endSlot = SECTION_TIME_MAP[endSection];

  if (!startSlot || !endSlot || endSection < startSection) {
    return { kind: 'allDay' };
  }

  return {
    kind: 'timed',
    start: startSlot.start,
    end: endSlot.end,
  };
}

export function getCurrentWeekRange(date: Date = new Date()): { startDate: string; endDate: string } {
  const today = beijingDate(date);
  const parsed = new Date(`${today}T00:00:00+08:00`);
  const weekday = parsed.getDay();
  const diffToMonday = (weekday + 6) % 7;
  parsed.setDate(parsed.getDate() - diffToMonday);
  const startDate = beijingDate(parsed);
  return {
    startDate,
    endDate: addDays(startDate, 6),
  };
}

export async function resolveCalendarSubscriptionUser(studentId: string): Promise<CalendarUser | null> {
  const db = getDb();
  const rows = await db
    .select({
      id: schema.users.id,
      studentId: schema.users.studentId,
      name: schema.users.name,
    })
    .from(schema.users)
    .where(eq(schema.users.studentId, studentId))
    .limit(1);

  const resolvedUser = rows[0];

  if (!resolvedUser) return null;

  return {
    id: resolvedUser.id,
    studentId: resolvedUser.studentId,
    name: resolvedUser.name?.trim() || undefined,
  };
}

export async function getCurrentWeekSchedule(user: CalendarUser) {
  const { startDate, endDate } = getCurrentWeekRange();
  const readSchedule = (forceRefresh: boolean) => ScheduleFacade.getPortalFirstSchedule({
    userId: user.id,
    studentId: user.studentId,
    startDate,
    endDate,
    forceRefresh,
    name: user.name,
  });
  let result = await readSchedule(false);
  const updatedAt = result._meta.updated_at ? Date.parse(result._meta.updated_at) : NaN;
  const staleSnapshot = result._meta.cached
    && (!Number.isFinite(updatedAt) || Date.now() - updatedAt >= CALENDAR_SNAPSHOT_MAX_AGE_MS);
  if (staleSnapshot) result = await readSchedule(true);

  return {
    range: { startDate, endDate },
    result,
  };
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
    if (dateA !== dateB) return dateA.localeCompare(dateB);
    return String(a.section || '').localeCompare(String(b.section || ''));
  });

  for (const course of sortedCourses) {
    const date = resolveCourseDate(course, options.weekStart);
    const timing = resolveCourseTiming(course.section);
    const uid = buildEventUid(course, options.studentId, date);
    const description = [
      `教师: ${course.teacher?.trim() || '未安排'}`,
      `地点: ${course.location?.trim() || '未安排'}`,
      `节次: ${course.section || '未安排'}`,
      `日期: ${date}`,
    ].join('\n');

    lines.push('BEGIN:VEVENT');
    appendLine(lines, `UID:${uid}`);
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

export function getSectionTimeMap() {
  return { ...SECTION_TIME_MAP };
}
