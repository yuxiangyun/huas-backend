/**
 * [INPUT]: 依赖 MessageMediaStorage 无主清理端口与 MessagingPolicy 安全年龄
 * [OUTPUT]: 对外提供 OrphanMessageMediaCleanupService.runOnce()
 * [POS]: modules/messaging/application 的周期任务窄适配层，将调度控制权留给根 periodic registry
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import type { MessagingPolicy } from '../domain/messaging';
import type { MessageMediaStorage } from '../domain/ports';

export class OrphanMessageMediaCleanupService {
  constructor(
    private readonly media: MessageMediaStorage,
    private readonly policy: Pick<MessagingPolicy, 'orphanMediaGraceMs'>,
  ) {}

  runOnce(now = new Date()) {
    return this.media.cleanupOrphans(new Date(now.getTime() - this.policy.orphanMediaGraceMs));
  }
}
