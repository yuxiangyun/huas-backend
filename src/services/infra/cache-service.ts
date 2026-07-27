/**
 * [INPUT]: 依赖 modules/cache 的 canonical CacheService
 * [OUTPUT]: 兼容再导出 CacheService，保留旧 services/infra 导入路径一个版本
 * [POS]: services/infra 的单向 Facade，不承载缓存策略、持久化或并发协调实现
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export { CacheService } from '../../modules/cache/cache-service';
