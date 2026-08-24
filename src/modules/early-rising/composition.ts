/**
 * [INPUT]: 依赖上层注入的 Drizzle db、CommunityDetailedProfileReader、可选 Clock 与模块内 application/事实设置 infrastructure/http 构造器
 * [OUTPUT]: 对外提供 createEarlyRisingModule(dependencies)，返回 service、事实/设置 repositories 与注入式 Hono routes
 * [POS]: modules/early-rising 的局部组合根，只装配本纵向切片的打卡和单行展示设置且不创建隐藏 singleton
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import type { getDb } from '../../db';
import type { CommunityDetailedProfileReader } from '../community/domain/ports';
import { EarlyRisingApplicationService } from './application/early-rising-application-service';
import type { EarlyRisingClock } from './application/ports';
import { createEarlyRisingRoutes } from './http/early-rising.routes';
import { SQLiteEarlyRisingRepository } from './infrastructure/sqlite-early-rising-repository';
import { SQLiteEarlyRisingSettingsRepository } from './infrastructure/sqlite-early-rising-settings-repository';

export interface EarlyRisingModuleDependencies {
  db: ReturnType<typeof getDb>;
  profiles: CommunityDetailedProfileReader;
  clock?: EarlyRisingClock;
}

const systemClock: EarlyRisingClock = {
  now: () => new Date(),
};

export function createEarlyRisingModule(dependencies: EarlyRisingModuleDependencies) {
  const repository = new SQLiteEarlyRisingRepository(dependencies.db);
  const settingsRepository = new SQLiteEarlyRisingSettingsRepository(dependencies.db);
  const service = new EarlyRisingApplicationService(
    repository,
    settingsRepository,
    dependencies.profiles,
    dependencies.clock ?? systemClock,
  );
  return {
    repository,
    settingsRepository,
    service,
    routes: createEarlyRisingRoutes(service),
  };
}
