/**
 * [INPUT]: 依赖 campus-integrations/cas 的 canonical AuthEngine
 * [OUTPUT]: 兼容再导出 AuthEngine 类
 * [POS]: auth 的只读迁移 Facade，保持旧 CAS 登录执行器路径稳定
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export { AuthEngine } from '../modules/campus-integrations/cas/auth-engine';
