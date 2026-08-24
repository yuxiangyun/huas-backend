/**
 * [INPUT]: 依赖 0003 已建立的 community_profiles 资料事实表
 * [OUTPUT]: 对外提供 communityBioSql，为详细公共资料增加可空单行 Bio 列
 * [POS]: migrations 的第五个 expand-only 版本，只扩展 Community 资料而不改写既有作者投影
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export const communityBioSql = `
ALTER TABLE community_profiles ADD COLUMN bio TEXT;
`;
