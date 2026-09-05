/**
 * [INPUT]: 依赖移动教务真实周课表 data、七天日期槽、三层 item、classTime 与统一课程 DTO
 * [OUTPUT]: 对外提供 parseMobileJwWeek，返回已验证周锚点和逐日期、逐连续节次投影的课程
 * [POS]: mobile-jw 的纯解析边界，不把缺载荷当空课表、不混用 courses 与 item，不丢失同节并行课程
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import type { ICourse } from '../../../types';
import { protocolFailure } from './errors';

const DAY_MS = 86_400_000;

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw protocolFailure();
  return value as Record<string, unknown>;
}

function text(value: unknown): string {
  if (typeof value !== 'string') throw protocolFailure();
  return value;
}

function integer(value: unknown, max: number): number {
  if ((typeof value !== 'string' && typeof value !== 'number') || !/^\d+$/.test(String(value))) throw protocolFailure();
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > max) throw protocolFailure();
  return parsed;
}

function dateValue(value: unknown): string {
  const date = text(value);
  const time = Date.parse(`${date}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(time)
    || new Date(time).toISOString().slice(0, 10) !== date) throw protocolFailure();
  return date;
}

export interface MobileJwWeek {
  week: number;
  weekStartDate: string;
  semesterId: string | null;
  maxWeek: number | null;
  courses: ICourse[];
}

export function parseMobileJwWeek(data: unknown): MobileJwWeek {
  if (!Array.isArray(data) || data.length !== 1) throw protocolFailure();
  const row = record(data[0]);
  if (!Array.isArray(row.date) || row.date.length !== 7 || !Array.isArray(row.item)
    || row.item.length !== 7 || !Array.isArray(row.courses) || !Array.isArray(row.nodesLst)) throw protocolFailure();
  const week = integer(row.week, 53);
  const dates = row.date.map((day) => dateValue(record(day).mxrq));
  const start = Date.parse(`${dates[0]}T00:00:00Z`);
  if (new Date(start).getUTCDay() !== 1 || dates.some((date, index) => Date.parse(`${date}T00:00:00Z`) !== start + index * DAY_MS)) throw protocolFailure();
  const nodes = new Set(row.nodesLst.map((node) => integer(record(node).nodeNumber, 12)));
  const courses: ICourse[] = [];
  let itemCount = 0;
  row.item.forEach((day, dayIndex) => {
    if (!Array.isArray(day)) throw protocolFailure();
    day.forEach((block) => {
      if (!Array.isArray(block)) throw protocolFailure();
      block.forEach((item) => {
        itemCount += 1;
        const course = record(item);
        const classTime = text(course.classTime);
        if (!/^[1-7](?:\d{2})+$/.test(classTime) || Number(classTime[0]) !== dayIndex + 1) throw protocolFailure();
        const sections = classTime.slice(1).match(/\d{2}/g)!.map((section) => integer(section, 12));
        if (sections.some((section, index) => !nodes.has(section) || (index > 0 && section <= sections[index - 1]))) throw protocolFailure();
        const name = text(course.courseName).trim();
        if (!name) throw protocolFailure();
        const base = {
          name, teacher: text(course.teacherName), location: text(course.location),
          day: dayIndex + 1, date: dates[dayIndex], weekStr: text(course.classWeek),
        };
        // classTime 是节次序列，不是首尾范围；不连续节次必须拆段，避免捏造中间课程。
        let first = sections[0];
        let last = first;
        for (const section of sections.slice(1)) {
          if (section !== last + 1) {
            courses.push({ ...base, section: first === last ? String(first) : `${first}-${last}` });
            first = section;
          }
          last = section;
        }
        courses.push({ ...base, section: first === last ? String(first) : `${first}-${last}` });
      });
    });
  });
  if (itemCount !== row.courses.length) throw protocolFailure();
  const info = Array.isArray(row.topInfo) && row.topInfo.length ? record(row.topInfo[0]) : null;
  const semesterId = info ? text(info.semesterId) : null;
  if (semesterId && !/^\d{4}-\d{4}-[1-3]$/.test(semesterId)) throw protocolFailure();
  return { week, weekStartDate: dates[0], semesterId, maxWeek: info ? integer(info.maxWeek, 53) : null, courses };
}
