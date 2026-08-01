/**
 * [INPUT]: 依赖服务端 Social 聚合摘要稳定响应，不依赖 React 或传输实现
 * [OUTPUT]: 对外提供 SocialUnreadSummary 前端契约
 * [POS]: entities/social 的跨域只读投影，只组合计数而不泄漏 Messaging/Notifications 内部模型
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export interface SocialUnreadSummary {
  messagingUnreadCount: number;
  notificationUnreadCount: number;
  notificationTotal: number;
}
