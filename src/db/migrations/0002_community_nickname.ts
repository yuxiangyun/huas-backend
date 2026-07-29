/**
 * [INPUT]: 依赖 0001 baseline 已存在的 users 表
 * [OUTPUT]: 对外提供 communityNicknameSql，为 Web 社区资料增加可空昵称列
 * [POS]: migrations 的第二个 expand-only 迁移，保留既有头像列与历史数据不变
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export const communityNicknameSql = `
ALTER TABLE users ADD COLUMN community_nickname TEXT;
`;
