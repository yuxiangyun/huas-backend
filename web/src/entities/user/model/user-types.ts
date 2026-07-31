/**
 * [INPUT]: 对齐校园用户资料与日历订阅接口的稳定响应字段
 * [OUTPUT]: 对外提供 UserProfile 与 CalendarSubscriptionLink 类型
 * [POS]: entities/user 的校园身份契约，与 Community 公共社交资料保持隔离
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export interface UserProfile {
  name: string;
  studentId: string;
  className: string;
  identity: string;
  organizationCode: string;
}

export interface CalendarSubscriptionLink {
  url: string;
  studentId: string;
  sig: string;
}
