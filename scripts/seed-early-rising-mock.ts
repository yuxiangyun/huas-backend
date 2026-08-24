/**
 * [INPUT]: 依赖显式 SQLite 路径、当前 schema、既有 users/community_profiles 真实资料与 Early Rising 北京时间纯规则
 * [OUTPUT]: 提供可审计的 Early Rising mock 打卡填充/manifest 精确撤销命令，不创建用户且不覆盖既有打卡
 * [POS]: scripts 的开发数据入口，绕过 HTTP 仅生成历史测试事实并以默认真实库拒绝门禁隔离生产风险
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { Database } from 'bun:sqlite';
import {
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, resolve } from 'node:path';
import { assertDatabaseSchemaCurrent } from '../src/db/migrator';
import { buildDefaultDisplayName } from '../src/modules/community/domain/community';
import {
  addEarlyRisingDays,
  describeBeijingTime,
} from '../src/modules/early-rising/domain/early-rising';

const MANIFEST_KIND = 'huas-early-rising-mock-seed';
const MANIFEST_VERSION = 1;
const DEFAULT_LIMIT = 20;
const DEFAULT_DAYS = 28;
const MAX_USERS = 100;
const MAX_DAYS = 90;
const CHECKIN_START_MS = (5 * 60 + 30) * 60_000;
const CHECKIN_END_MS = (9 * 60 + 30) * 60_000;

interface ExistingProfileRow {
  id: number;
  class_name: string | null;
  nickname: string | null;
  avatar_url: string | null;
  bio: string | null;
}

interface SeededCheckin {
  id: number;
  userId: number;
  checkinDate: string;
  checkedAtMs: number;
}

interface SeedManifest {
  kind: typeof MANIFEST_KIND;
  version: typeof MANIFEST_VERSION;
  state: 'applied' | 'undone';
  databasePath: string;
  createdAt: string;
  undoneAt?: string;
  seed: number;
  days: number;
  userIds: number[];
  rows: SeededCheckin[];
}

interface ApplyOptions {
  mode: 'apply';
  dbPath: string;
  manifestPath: string;
  allowRealDb: boolean;
  limit: number;
  days: number;
  seed: number;
  userIds: number[];
}

interface UndoOptions {
  mode: 'undo';
  dbPath: string;
  manifestPath: string;
  allowRealDb: boolean;
}

type Options = ApplyOptions | UndoOptions;

function usage(): never {
  console.error([
    'Usage:',
    '  bun run seed:early-rising -- --db <sqlite-path> --apply [--limit 20] [--days 28] [--seed 20260824] [--user-ids 1,2] [--manifest <json-path>]',
    '  bun run seed:early-rising -- --db <sqlite-path> --undo <manifest-path>',
    '  Add --allow-real-db only after explicitly confirming a protected real database target.',
  ].join('\n'));
  process.exit(2);
}

function optionValue(args: string[], name: string) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function parsePositiveInt(value: string | undefined, fallback: number, max: number, name: string) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) {
    throw new Error(`${name} 必须是 1 到 ${max} 的整数`);
  }
  return parsed;
}

function parseUserIds(value: string | undefined) {
  if (!value) return [];
  const ids = Array.from(new Set(value.split(',').map((part) => Number(part.trim()))));
  if (ids.length > MAX_USERS || ids.some((id) => !Number.isInteger(id) || id <= 0)) {
    throw new Error(`--user-ids 只接受最多 ${MAX_USERS} 个逗号分隔的正整数`);
  }
  return ids;
}

function defaultManifestPath(dbPath: string) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return resolve(dirname(dbPath), 'early-rising-seed-manifests', `seed-${stamp}.json`);
}

function parseOptions(args: string[]): Options {
  const dbValue = optionValue(args, '--db');
  if (!dbValue) usage();
  const dbPath = resolve(dbValue);
  const allowRealDb = args.includes('--allow-real-db');
  const undoValue = optionValue(args, '--undo');
  const apply = args.includes('--apply');
  if ((apply && undoValue) || (!apply && !undoValue)) usage();
  if (undoValue) {
    return { mode: 'undo', dbPath, manifestPath: resolve(undoValue), allowRealDb };
  }

  const seed = parsePositiveInt(optionValue(args, '--seed'), 20_260_824, 2_147_483_647, '--seed');
  return {
    mode: 'apply',
    dbPath,
    manifestPath: resolve(optionValue(args, '--manifest') || defaultManifestPath(dbPath)),
    allowRealDb,
    limit: parsePositiveInt(optionValue(args, '--limit'), DEFAULT_LIMIT, MAX_USERS, '--limit'),
    days: parsePositiveInt(optionValue(args, '--days'), DEFAULT_DAYS, MAX_DAYS, '--days'),
    seed,
    userIds: parseUserIds(optionValue(args, '--user-ids')),
  };
}

function assertSafeDatabaseTarget(options: Options) {
  const protectedPaths = new Set([
    resolve(process.cwd(), 'data', 'huas.db'),
    ...(process.env.DB_PATH ? [resolve(process.env.DB_PATH)] : []),
  ]);
  const protectedEnvironment = process.env.NODE_ENV?.trim().toLowerCase() === 'production';
  if (!options.allowRealDb && (protectedEnvironment || protectedPaths.has(options.dbPath))) {
    throw new Error('拒绝操作真实数据库；确认目标和备份后才可显式传入 --allow-real-db');
  }
}

function selectProfiles(database: Database, options: ApplyOptions): ExistingProfileRow[] {
  if (options.userIds.length > 0) {
    const readOne = database.query<ExistingProfileRow, [number]>(`
      SELECT u.id, u.class_name, cp.nickname, cp.avatar_url, cp.bio
      FROM users u
      LEFT JOIN community_profiles cp ON cp.user_id = u.id
      WHERE u.id = ?
    `);
    const rows = options.userIds.flatMap((userId) => {
      const row = readOne.get(userId);
      return row ? [row] : [];
    });
    if (rows.length !== options.userIds.length) {
      const found = new Set(rows.map((row) => row.id));
      const missing = options.userIds.filter((userId) => !found.has(userId));
      throw new Error(`以下真实用户不存在：${missing.join(', ')}`);
    }
    return rows;
  }

  return database.query<ExistingProfileRow, [number]>(`
    SELECT u.id, u.class_name, cp.nickname, cp.avatar_url, cp.bio
    FROM users u
    LEFT JOIN community_profiles cp ON cp.user_id = u.id
    ORDER BY (cp.nickname IS NOT NULL OR cp.avatar_url IS NOT NULL OR cp.bio IS NOT NULL) DESC,
             u.last_active_at DESC,
             u.id ASC
    LIMIT ?
  `).all(options.limit);
}

function mix(seed: number, userId: number, dayOffset: number) {
  let value = (seed ^ Math.imul(userId, 0x45d9f3b) ^ Math.imul(dayOffset + 1, 0x27d4eb2d)) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d) >>> 0;
  value ^= value >>> 15;
  return value >>> 0;
}

function shouldCheckIn(seed: number, userId: number, userIndex: number, dayOffset: number) {
  const guaranteedRecentStreak = 3 + ((11 - (userIndex % 12) + 12) % 12);
  return dayOffset < guaranteedRecentStreak || mix(seed, userId, dayOffset) % 100 < 64;
}

function resolveSeedEndDate(now: Date) {
  const beijing = describeBeijingTime(now);
  return beijing.millisecondsOfDay >= CHECKIN_START_MS
    ? beijing.date
    : addEarlyRisingDays(beijing.date, -1);
}

function checkedAtFor(
  date: string,
  now: Date,
  seed: number,
  userId: number,
  dayOffset: number,
) {
  const beijingNow = describeBeijingTime(now);
  const latestOffset = date === beijingNow.date
    ? Math.max(0, Math.min(CHECKIN_END_MS - CHECKIN_START_MS - 1, beijingNow.millisecondsOfDay - CHECKIN_START_MS))
    : CHECKIN_END_MS - CHECKIN_START_MS - 1;
  const offset = mix(seed + 17, userId, dayOffset) % (latestOffset + 1);
  const milliseconds = CHECKIN_START_MS + offset;
  const hour = Math.floor(milliseconds / 3_600_000);
  const minute = Math.floor((milliseconds % 3_600_000) / 60_000);
  const second = Math.floor((milliseconds % 60_000) / 1_000);
  const millis = milliseconds % 1_000;
  return new Date(
    `${date}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}.${String(millis).padStart(3, '0')}+08:00`,
  );
}

function applySeed(database: Database, options: ApplyOptions) {
  const profiles = selectProfiles(database, options);
  if (profiles.length === 0) throw new Error('数据库中没有可用于 mock 打卡的真实用户');
  const now = new Date();
  const endDate = resolveSeedEndDate(now);
  const insert = database.query<
    { id: number },
    [number, string, number]
  >(`
    INSERT INTO early_rising_checkins (user_id, checkin_date, checked_at)
    VALUES (?, ?, ?)
    ON CONFLICT(user_id, checkin_date) DO NOTHING
    RETURNING id
  `);
  const rows: SeededCheckin[] = [];
  mkdirSync(dirname(options.manifestPath), { recursive: true });
  let manifestCreated = false;

  const run = database.transaction(() => {
    profiles.forEach((profile, userIndex) => {
      for (let dayOffset = 0; dayOffset < options.days; dayOffset += 1) {
        if (!shouldCheckIn(options.seed, profile.id, userIndex, dayOffset)) continue;
        const checkinDate = addEarlyRisingDays(endDate, -dayOffset);
        const checkedAt = checkedAtFor(checkinDate, now, options.seed, profile.id, dayOffset);
        const inserted = insert.get(profile.id, checkinDate, checkedAt.getTime());
        if (inserted) {
          rows.push({
            id: Number(inserted.id),
            userId: profile.id,
            checkinDate,
            checkedAtMs: checkedAt.getTime(),
          });
        }
      }
    });

    const manifest: SeedManifest = {
      kind: MANIFEST_KIND,
      version: MANIFEST_VERSION,
      state: 'applied',
      databasePath: options.dbPath,
      createdAt: now.toISOString(),
      seed: options.seed,
      days: options.days,
      userIds: profiles.map((profile) => profile.id),
      rows,
    };
    writeFileSync(options.manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, {
      encoding: 'utf8',
      flag: 'wx',
    });
    manifestCreated = true;
  });

  try {
    run();
  } catch (cause) {
    if (manifestCreated) rmSync(options.manifestPath, { force: true });
    throw cause;
  }

  return {
    profiles: profiles.map((profile) => ({
      id: profile.id,
      displayName: profile.nickname?.trim() || buildDefaultDisplayName(profile.id, profile.class_name),
      avatarUrl: profile.avatar_url,
      bio: profile.bio,
    })),
    inserted: rows.length,
    manifestPath: options.manifestPath,
    range: { from: addEarlyRisingDays(endDate, 1 - options.days), to: endDate },
  };
}

function readManifest(path: string): SeedManifest {
  const manifest = JSON.parse(readFileSync(path, 'utf8')) as SeedManifest;
  if (manifest.kind !== MANIFEST_KIND || manifest.version !== MANIFEST_VERSION) {
    throw new Error('撤销清单类型或版本不受支持');
  }
  if (!Array.isArray(manifest.rows) || !Array.isArray(manifest.userIds)) {
    throw new Error('撤销清单结构不完整');
  }
  if (manifest.state !== 'applied' && manifest.state !== 'undone') {
    throw new Error('撤销清单状态不合法');
  }
  if (manifest.rows.some((row) => (
    !Number.isInteger(row.id)
    || row.id <= 0
    || !Number.isInteger(row.userId)
    || row.userId <= 0
    || !/^\d{4}-\d{2}-\d{2}$/.test(row.checkinDate)
    || !Number.isInteger(row.checkedAtMs)
    || row.checkedAtMs <= 0
  ))) {
    throw new Error('撤销清单包含非法打卡定位字段');
  }
  return manifest;
}

function undoSeed(database: Database, options: UndoOptions) {
  const manifest = readManifest(options.manifestPath);
  if (resolve(manifest.databasePath) !== options.dbPath) {
    throw new Error('撤销清单所属数据库与 --db 不一致');
  }
  if (manifest.state === 'undone') return { removed: 0, alreadyUndone: true };

  const remove = database.query<
    { id: number },
    [number, number, string, number]
  >(`
    DELETE FROM early_rising_checkins
    WHERE id = ? AND user_id = ? AND checkin_date = ? AND checked_at = ?
    RETURNING id
  `);
  let removed = 0;
  database.transaction(() => {
    for (const row of manifest.rows) {
      if (remove.get(row.id, row.userId, row.checkinDate, row.checkedAtMs)) removed += 1;
    }
  })();

  writeFileSync(options.manifestPath, `${JSON.stringify({
    ...manifest,
    state: 'undone',
    undoneAt: new Date().toISOString(),
  } satisfies SeedManifest, null, 2)}\n`, 'utf8');
  return { removed, alreadyUndone: false };
}

function main() {
  const options = parseOptions(process.argv.slice(2));
  assertSafeDatabaseTarget(options);
  const database = new Database(options.dbPath, { create: false, readwrite: true });
  try {
    database.exec('PRAGMA foreign_keys = ON');
    database.exec('PRAGMA busy_timeout = 5000');
    assertDatabaseSchemaCurrent(database);
    const result = options.mode === 'apply'
      ? applySeed(database, options)
      : undoSeed(database, options);
    console.log(JSON.stringify({ database: options.dbPath, mode: options.mode, ...result }, null, 2));
  } finally {
    database.close();
  }
}

try {
  main();
} catch (cause) {
  const message = cause instanceof Error ? cause.message : String(cause);
  console.error(`Early Rising mock 数据操作失败：${message}`);
  process.exitCode = 1;
}
