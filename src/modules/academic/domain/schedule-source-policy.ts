/**
 * [INPUT]: 无运行时依赖，表达课表来源编排模式与持久化端口
 * [OUTPUT]: 对外提供 ScheduleSourceMode、PolicySnapshot、PolicyStore 与来源顺序纯规则
 * [POS]: academic/domain 的课表来源策略语言，隔离 application 编排与文件热状态实现
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import type { ScheduleSource } from './schedule';

export type ScheduleSourceMode = 'jw-first' | 'portal-first';

export interface ScheduleSourcePolicySnapshot {
  mode: ScheduleSourceMode;
  updatedAt: string;
  updatedBy: string;
}

export interface ScheduleSourcePolicyStore {
  read(): Promise<ScheduleSourcePolicySnapshot>;
  write(mode: ScheduleSourceMode, updatedBy: string): Promise<ScheduleSourcePolicySnapshot>;
}

export function isScheduleSourceMode(value: unknown): value is ScheduleSourceMode {
  return value === 'jw-first' || value === 'portal-first';
}

export function getScheduleSourcePlan(mode: ScheduleSourceMode): readonly ScheduleSource[] {
  return mode === 'portal-first' ? ['portal', 'jw'] : ['jw', 'portal'];
}
