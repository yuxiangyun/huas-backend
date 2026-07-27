/**
 * [INPUT]: 依赖 modules/operations/http 的 canonical 后台 Cookie 会话边界
 * [OUTPUT]: 继续导出后台会话创建、探测、撤销与 middleware 旧路径
 * [POS]: middleware 的单向兼容 Facade；会话实现已迁入 Operations
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export {
  adminSessionMiddleware,
  createAdminSession,
  currentAdminSession,
  revokeAdminSession,
} from '../modules/operations/http/admin-session.middleware';
