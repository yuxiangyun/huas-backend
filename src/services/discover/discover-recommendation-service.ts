/**
 * [INPUT]: 依赖 modules/discover/composition 的 canonical 推荐 application 委托类
 * [OUTPUT]: 再导出旧 DiscoverRecommendationService 类名与路径
 * [POS]: services/discover 的推荐兼容 Facade，不承载用例编排或偏好算法副本
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export { DiscoverRecommendationService } from '../../modules/discover/composition';
