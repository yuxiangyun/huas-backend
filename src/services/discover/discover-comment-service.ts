/**
 * [INPUT]: 依赖 modules/discover/composition 的 canonical 评论 application 委托类
 * [OUTPUT]: 再导出旧 DiscoverCommentService 类名与路径
 * [POS]: services/discover 的评论兼容 Facade，不参与 application 编排或 SQLite 事务
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export { DiscoverCommentService } from '../../modules/discover/composition';
