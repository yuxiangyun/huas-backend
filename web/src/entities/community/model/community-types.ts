/**
 * [INPUT]: 对齐服务端 Community 公共资料 DTO，不依赖 React 或请求实现
 * [OUTPUT]: 对外提供 CommunityProfile，统一社交作者、会话参与者与通知触发者的公开形状
 * [POS]: entities/community 的共享领域契约，被各 Social 实体单向依赖
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export interface CommunityProfile {
  id: number;
  displayName: string;
  avatarUrl: string | null;
}

export interface CurrentCommunityProfile extends CommunityProfile {
  nickname: string | null;
}
