/**
 * [INPUT]: 无运行时依赖，仅定义 Identity 面向管理聚合的稳定只读模型
 * [OUTPUT]: 对外提供 IdentityOperationsQueryPort、独立用户列表、概览及兼容管理快照 DTO
 * [POS]: identity/domain 的只读查询契约，让 Operations 聚合身份事实而不理解 users/credentials/cache 表
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export interface IdentityOperationsQuery {
  page: number;
  pageSize: number;
  search: string;
  major: string;
  grade: string;
  todayStartMs: number;
  sevenDaysAgoMs: number;
}

export interface IdentityOperationsUser {
  studentId: string;
  name: string;
  className: string;
  grade: string;
  createdAt: string | null;
  lastLoginAt: string | null;
  lastActiveAt: string | null;
}

export interface IdentityOperationsSnapshot {
  metrics: {
    totalUsers: number;
    todayActiveUsers: number;
    activeUsers7d: number;
    newUsers7d: number;
    cacheEntries: number;
    credentialEntries: number;
  };
  distributions: {
    byMajor: Array<{ className: string; count: number }>;
    byGrade: Array<{ grade: string; count: number }>;
  };
  users: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
    filters: { search: string; major: string; grade: string };
    options: {
      majors: Array<{ value: string; label: string }>;
      grades: string[];
    };
    items: IdentityOperationsUser[];
  };
}

export interface IdentityOperationsQueryPort {
  listUsers(query: IdentityAdminUsersQuery): Promise<IdentityAdminUsers>;
  getOverview(query: { todayStartMs: number; sevenDaysAgoMs: number }): Promise<IdentityOperationsOverview>;
  getSnapshot(query: IdentityOperationsQuery): Promise<IdentityOperationsSnapshot>;
}

export interface IdentityAdminUsersQuery {
  page?: number;
  search?: string;
  className?: string;
  grade?: string;
}

export interface IdentityAdminUsers {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  filters: { search: string; className: string; grade: string };
  options: { classes: Array<{ value: string; label: string }>; grades: string[] };
  items: IdentityOperationsUser[];
}

export type IdentityOperationsOverview = Pick<IdentityOperationsSnapshot, 'metrics' | 'distributions'>;
