/**
 * [INPUT]: 无运行时依赖，仅定义 Operations 稳定应用数据
 * [OUTPUT]: 对外提供 DashboardQuery、TerminalLogQuery/Response 与 SystemOperationsSnapshot
 * [POS]: operations/domain 的纯数据语言，隔离 HTTP 字符串输入与 infrastructure 实现
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export interface DashboardQuery {
  page?: string;
  search?: string;
  major?: string;
  grade?: string;
}

export type TerminalLogSource = 'out' | 'error';

export interface TerminalLogQuery {
  limit?: number;
  keyword?: string;
}

export interface TerminalLogResponse {
  limit: number;
  keyword: string;
  items: Array<{ source: TerminalLogSource; line: string }>;
}

export interface SystemOperationsSnapshot {
  databaseStatus: 'ok' | 'error';
  memory: { rssMb: number; heapUsedMb: number; heapTotalMb: number };
  uptimeSeconds: number;
}

export interface HealthProcessStatus {
  ready: boolean;
  shuttingDown: boolean;
  shutdownSignal: string | null;
  deploySlot: string;
}
