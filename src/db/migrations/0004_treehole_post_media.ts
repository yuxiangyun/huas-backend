/**
 * [INPUT]: 依赖 0003 已存在的 treehole_posts 内容事实表
 * [OUTPUT]: 对外提供 Treehole 帖子私有图片批次键与稳定存储中立元数据的 expand-only migration
 * [POS]: migrations 的第四个前向版本，只扩展帖子事实而不改写或删除历史数据
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export const treeholePostMediaSql = `
ALTER TABLE treehole_posts ADD COLUMN media_key TEXT;
ALTER TABLE treehole_posts ADD COLUMN images_json TEXT NOT NULL DEFAULT '[]';
CREATE UNIQUE INDEX uq_treehole_posts_media_key
ON treehole_posts(media_key)
WHERE media_key IS NOT NULL;
`;
