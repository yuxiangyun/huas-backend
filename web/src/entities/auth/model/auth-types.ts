/**
 * [INPUT]: 无运行时依赖，仅承载普通用户认证的稳定数据形状
 * [OUTPUT]: 对外提供 UserBrief 与 AuthSession 类型
 * [POS]: entities/auth 的类型核心，隔离服务端响应、状态存储与 UI 消费者
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export interface UserBrief {
  name: string;
  studentId: string;
  className: string;
}

export interface AuthSession {
  token: string;
  userBrief: UserBrief;
}
