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
