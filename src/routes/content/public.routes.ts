/**
 * [INPUT]: 依赖 modules/operations/http 的 canonical 公共公告/首页弹窗路由
 * [OUTPUT]: 继续默认导出旧 public routes 路径，保持 `/api/public` 匿名挂载兼容
 * [POS]: routes/content 的单向兼容 Facade；公共内容 HTTP 实现已迁入 Operations
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export { default } from '../../modules/operations/http/public.routes';
