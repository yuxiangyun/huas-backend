/**
 * [INPUT]: 依赖 modules/operations composition 的 canonical Dashboard 聚合服务
 * [OUTPUT]: 继续导出 AdminDashboardService 旧类名与路径
 * [POS]: services/admin 的单向兼容 Facade；跨域只读聚合已迁入 Operations application
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export { AdminDashboardService } from '../../modules/operations/composition';
