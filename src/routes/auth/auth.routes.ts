/**
 * [INPUT]: 依赖 modules/identity/http 的登录 Hono 路由
 * [OUTPUT]: 继续默认导出旧 authRoutes 路径，保持 routes/index.ts 与外部测试兼容
 * [POS]: routes/auth 的单向兼容 Facade；真实登录 HTTP 实现已迁入 Identity 纵向切片
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export { default } from '../../modules/identity/http/auth.routes';
