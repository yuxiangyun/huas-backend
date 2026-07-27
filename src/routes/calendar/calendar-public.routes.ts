/**
 * [INPUT]: 依赖 modules/calendar/http 的公开 ICS Hono 路由
 * [OUTPUT]: 继续默认导出旧 calendar-public route 路径
 * [POS]: routes/calendar 的单向兼容 Facade，保持 routes/index.ts 挂载路径不变
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export { default } from '../../modules/calendar/http/calendar-public.routes';
