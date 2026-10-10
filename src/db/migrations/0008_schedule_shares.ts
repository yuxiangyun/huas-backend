/** 不可变分享快照为独立持久事实，不参与缓存淘汰或账号删除级联。 */
export const scheduleSharesSql = `
CREATE TABLE schedule_shares (
  token_hash TEXT PRIMARY KEY NOT NULL CONSTRAINT ck_schedule_shares_token_hash_length CHECK(length(token_hash) = 64),
  snapshot_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
`;
