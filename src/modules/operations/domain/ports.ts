/**
 * [INPUT]: 依赖 Operations 稳定 DTO，不依赖具体数据库、文件系统或跨领域实现
 * [OUTPUT]: 对外提供公告、日志、系统、Early Rising 设置与社区管理命令端口
 * [POS]: operations/domain 的依赖倒置边界，供 application 构造注入真实 adapters
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import type { HealthProcessStatus, SystemOperationsSnapshot, TerminalLogQuery, TerminalLogResponse } from './operations';

export interface AnnouncementQueryPort {
  listAdmin(): Promise<unknown[]>;
}

export interface TerminalLogQueryPort {
  list(query: TerminalLogQuery): Promise<TerminalLogResponse>;
}

export interface SystemOperationsPort {
  snapshot(): SystemOperationsSnapshot;
  healthStatus(): HealthProcessStatus;
  databaseIsHealthy(): boolean;
}

export interface DiscoverAdminCommandPort {
  deletePost(postId: number): Promise<{ id: number } | null>;
}

export interface TreeholeAdminCommandPort {
  deletePost(postId: number): Promise<{ id: number } | null>;
  deleteComment(commentId: number): Promise<{ id: number; postId: number } | null>;
}

export interface EarlyRisingAdminSettingsSnapshot {
  profileEntryVisible: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface EarlyRisingAdminSettingsPort {
  getAdminSettings(): Promise<EarlyRisingAdminSettingsSnapshot>;
  updateSettings(
    profileEntryVisible: boolean,
    updatedBy: string,
  ): Promise<EarlyRisingAdminSettingsSnapshot>;
}
