/**
 * [INPUT]: 依赖 modules/calendar/http 的登录态 Hono 路由
 * [OUTPUT]: 继续默认导出旧 calendar-api route 路径
 * [POS]: routes/calendar 的单向兼容 Facade，真实 HTTP 实现已迁入 Calendar 纵向切片
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export { default } from '../../modules/calendar/http/calendar-api.routes';
