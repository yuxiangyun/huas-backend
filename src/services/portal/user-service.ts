/**
 * [INPUT]: 依赖 campus-integrations/portal 的 canonical UserService
 * [OUTPUT]: 兼容再导出 UserService 类
 * [POS]: services/portal 的只读迁移 Facade，保持路由与旧登录资料回写调用稳定
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export { UserService } from '../../modules/campus-integrations/portal/user-service';
