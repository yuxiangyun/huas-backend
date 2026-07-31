/**
 * [INPUT]: 依赖 modules/operations application 的 canonical Dashboard 聚合类
 * [OUTPUT]: 继续以 AdminDashboardService 旧类名导出可构造的 application service
 * [POS]: services/admin 的类型级单向 Facade；生产实例只由 src/composition.ts 注入公开 ports 后创建
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export { AdminDashboardApplicationService as AdminDashboardService } from '../../modules/operations/application/admin-dashboard-service';
