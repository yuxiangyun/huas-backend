/**
 * [INPUT]: 依赖 modules/discover/http 的 canonical Hono 子路由
 * [OUTPUT]: 默认再导出 Discover 旧路由路径，保持 routes/index.ts 装配兼容
 * [POS]: routes/discover 的单向 HTTP Facade，不承载协议解析或业务规则
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export { default } from '../../modules/discover/http/discover.routes';
