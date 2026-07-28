/**
 * [INPUT]: 依赖 domain ScheduleSourcePolicyStore 与稳定策略契约
 * [OUTPUT]: 对外提供 ScheduleSourcePolicyApplicationService，读取状态快照并执行受控热切换
 * [POS]: academic/application 的来源策略用例边界，供课表编排与 Operations 管理面共享
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import type {
  ScheduleSourceMode,
  ScheduleSourcePolicySnapshot,
  ScheduleSourcePolicyStore,
} from '../domain/schedule-source-policy';

export class ScheduleSourcePolicyApplicationService {
  constructor(private readonly store: ScheduleSourcePolicyStore) {}

  status(): Promise<ScheduleSourcePolicySnapshot> {
    return this.store.read();
  }

  configure(mode: ScheduleSourceMode, updatedBy: string): Promise<ScheduleSourcePolicySnapshot> {
    return this.store.write(mode, updatedBy);
  }
}
