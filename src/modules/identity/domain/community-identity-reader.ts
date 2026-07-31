/**
 * [INPUT]: 无运行时依赖，仅描述 Community 所需的最小校园身份投影
 * [OUTPUT]: 对外提供 CommunityIdentityReader 与仅含 id/className 的只读身份 DTO
 * [POS]: identity/domain 面向 Community 的窄端口，避免社区资料模块读取 users 表或校园敏感身份
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export interface CommunityIdentity {
  id: number;
  className: string | null;
}

export interface CommunityIdentityReader {
  getMany(userIds: readonly number[]): Promise<Map<number, CommunityIdentity>>;
}
