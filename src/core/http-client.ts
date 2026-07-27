/**
 * [INPUT]: 依赖 campus-integrations/http 的 canonical HttpClient
 * [OUTPUT]: 兼容再导出 HttpClient，保留旧 core 导入路径与方法签名
 * [POS]: core 的只读迁移 Facade，校园 HTTP 实现只存在于 campus-integrations
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export { HttpClient } from '../modules/campus-integrations/http/http-client';
