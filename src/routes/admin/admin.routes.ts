/**
 * [INPUT]: 依赖 modules/operations/http 的 canonical 管理路由 factory
 * [OUTPUT]: 继续导出 createAdminRoutes 旧路径别名
 * [POS]: routes/admin 的单向兼容 Facade；真实路由实例由根组合注入应用
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export { createAdminRoutes, default } from '../../modules/operations/http/admin.routes';
