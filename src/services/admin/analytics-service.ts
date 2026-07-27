/**
 * [INPUT]: 依赖 modules/operations/infrastructure 的 canonical 同步 analytics 服务
 * [OUTPUT]: 继续导出 AnalyticsService、AnalyticsPlatform 旧类名/类型与路径
 * [POS]: services/admin 的单向兼容 Facade；渠道事实读写已迁入 Operations
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export { AnalyticsService } from '../../modules/operations/infrastructure/analytics-service';
export type { AnalyticsPlatform } from '../../modules/operations/infrastructure/analytics-service';
