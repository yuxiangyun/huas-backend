/**
 * [INPUT]: 依赖 campus-integrations/http 的 canonical retry 实现
 * [OUTPUT]: 兼容再导出 RetryOptions 与 retryAsync
 * [POS]: core 的只读迁移 Facade，保持旧重试工具路径稳定
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export { retryAsync } from '../modules/campus-integrations/http/retry';
export type { RetryOptions } from '../modules/campus-integrations/http/retry';
