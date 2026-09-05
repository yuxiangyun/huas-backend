/**
 * [INPUT]: 依赖 config.timeZone 与 Intl.DateTimeFormat，统一项目北京时间格式
 * [OUTPUT]: 对外提供北京时间日期、日期时间、带偏移 ISO、日初与时间戳转换
 * [POS]: utils 的无状态时间边界，为缓存数据时间与业务日期提供共同格式，不决定缓存过期策略
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { config } from '../config';

const DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: config.timeZone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const DATE_TIME_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: config.timeZone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
  hourCycle: 'h23',
});

function toPartsMap(parts: Intl.DateTimeFormatPart[]): Record<string, string> {
  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

export function beijingDate(date: Date = new Date()): string {
  const parts = toPartsMap(DATE_FORMATTER.formatToParts(date));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function beijingDateTime(date: Date = new Date()): string {
  const parts = toPartsMap(DATE_TIME_FORMATTER.formatToParts(date));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}

export function beijingIsoString(date: Date = new Date()): string {
  const millis = String(date.getMilliseconds()).padStart(3, '0');
  return `${beijingDateTime(date).replace(' ', 'T')}.${millis}+08:00`;
}

export function startOfBeijingDay(date: Date = new Date()): Date {
  return new Date(`${beijingDate(date)}T00:00:00.000+08:00`);
}

export function parseBeijingDateTimeToEpoch(value: string): number {
  const match = value.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})/);
  if (!match) return 0;
  const parsed = new Date(`${match[1]}T${match[2]}.000+08:00`);
  const ts = parsed.getTime();
  return Number.isNaN(ts) ? 0 : ts;
}
