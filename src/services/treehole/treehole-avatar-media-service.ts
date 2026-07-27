/**
 * [INPUT]: 依赖 modules/treehole/composition 的 canonical 头像媒体出口
 * [OUTPUT]: 再导出旧 TreeholeAvatarMediaService 类名、公开缓存常量与路径
 * [POS]: services/treehole 的头像媒体兼容 Facade，保持 src/index.ts 和测试装配稳定
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export {
  TreeholeAvatarMediaService,
  TREEHOLE_AVATAR_CACHE_CONTROL,
} from '../../modules/treehole/composition';
