/**
 * [INPUT]: 依赖 modules/operations/http 的 canonical 管理路由
 * [OUTPUT]: 继续默认导出旧 admin routes 路径，保持 routes/index.ts 挂载兼容
 * [POS]: routes/admin 的单向兼容 Facade；管理 HTTP 实现已迁入 Operations
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export { default } from '../../modules/operations/http/admin.routes';
