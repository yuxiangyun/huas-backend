/**
 * [INPUT]: 依赖 modules/operations/http 的 canonical 健康检查路由
 * [OUTPUT]: 继续默认导出旧 health routes 路径，保持 `/health` 挂载兼容
 * [POS]: routes/system 的单向兼容 Facade；健康 HTTP 实现已迁入 Operations
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export { default } from '../../modules/operations/http/health.routes';
