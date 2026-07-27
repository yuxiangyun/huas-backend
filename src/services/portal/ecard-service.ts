/**
 * [INPUT]: 依赖 campus-integrations/portal 的 canonical ECardService
 * [OUTPUT]: 兼容再导出 ECardService 类
 * [POS]: services/portal 的只读迁移 Facade，保持路由与旧服务调用方稳定
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export { ECardService } from '../../modules/campus-integrations/portal/ecard-service';
