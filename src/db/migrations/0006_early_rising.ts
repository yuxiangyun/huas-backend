/**
 * [INPUT]: 依赖 users 身份主键与 SQLite timestamp_ms 整数存储约定
 * [OUTPUT]: 对外提供 earlyRisingSql，建立每日唯一的 Early Rising 打卡事实及日榜/用户趋势索引
 * [POS]: migrations 的第六个 expand-only 版本，只保存服务端裁决的北京时间日期与接收时间
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export const earlyRisingSql = `
CREATE TABLE early_rising_checkins (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  checkin_date TEXT NOT NULL,
  checked_at INTEGER NOT NULL,
  CONSTRAINT uq_early_rising_checkins_user_date UNIQUE(user_id, checkin_date)
);
CREATE INDEX idx_early_rising_checkins_daily_ranking
ON early_rising_checkins(checkin_date, checked_at, id);
CREATE INDEX idx_early_rising_checkins_user_trend
ON early_rising_checkins(user_id, checkin_date);
`;
