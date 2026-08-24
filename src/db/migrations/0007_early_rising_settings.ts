/**
 * [INPUT]: 依赖 Early Rising 模块已建立的数据库迁移序列与 SQLite 单行约束
 * [OUTPUT]: 对外提供 earlyRisingSettingsSql，建立默认显示个人资料入口的单行设置快照
 * [POS]: migrations 的第七个 expand-only 版本，让后台展示控制随 SQLite 一致性快照持久化
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export const earlyRisingSettingsSql = `
CREATE TABLE early_rising_settings (
  id INTEGER PRIMARY KEY NOT NULL CHECK(id = 1),
  profile_entry_visible INTEGER NOT NULL DEFAULT 1 CHECK(profile_entry_visible IN (0, 1)),
  updated_at INTEGER,
  updated_by TEXT
);
INSERT INTO early_rising_settings (id, profile_entry_visible) VALUES (1, 1);
`;
