/**
 * [INPUT]: 依赖 canonical CacheService 的 SQLite 持久化、永久 TTL 与进程内同键合流
 * [OUTPUT]: 对外提供 CalendarSnapshotCacheStore，保存每用户最近完整 ICS 与回源开始时间
 * [POS]: Calendar 的订阅状态适配器，以独立键隔离周课表刷新；先保存回源机会，使重启不会绕过 24 小时窗口
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { CacheService } from '../../cache/cache-service';
import type { CalendarSnapshot, CalendarSnapshotStore } from '../application/calendar.ports';

const key = (userId: number) => `calendar-semester:${userId}`;

export class CalendarSnapshotCacheStore implements CalendarSnapshotStore {
  async get(userId: number): Promise<CalendarSnapshot | null> {
    const value = (await CacheService.get<CalendarSnapshot>(key(userId)))?.data;
    if (!value || value.v !== 1 || !Number.isFinite(value.attemptedAt)
      || (value.ics !== null && typeof value.ics !== 'string')) return null;
    return value;
  }

  set(userId: number, snapshot: CalendarSnapshot) {
    return CacheService.set(key(userId), snapshot, 0, 'mobile-jw');
  }

  runSingleflight<T>(userId: number, operation: () => Promise<T>): Promise<T> {
    return CacheService.runSingleflight(key(userId), false, operation);
  }
}
