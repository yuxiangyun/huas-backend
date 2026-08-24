/**
 * [INPUT]: 依赖 baseline、Community 资料、社交 contract、Treehole 图片与 Early Rising 等编号 migration 的不可变 SQL
 * [OUTPUT]: 对外提供按版本严格排序的 MIGRATIONS 清单与 Migration 类型
 * [POS]: migrations 的唯一注册表，隔离迁移发现顺序与执行引擎
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { baselineSql } from './0001_baseline';
import { communityNicknameSql } from './0002_community_nickname';
import {
  socialRearchitectureSql,
  socialRearchitectureStatements,
} from './0003_social_rearchitecture';
import { treeholePostMediaSql } from './0004_treehole_post_media';
import { communityBioSql } from './0005_community_bio';
import { earlyRisingSql } from './0006_early_rising';

export interface Migration {
  version: number;
  name: string;
  sql: string;
  statements?: readonly string[];
  destructive?: boolean;
}

export const MIGRATIONS: readonly Migration[] = [
  { version: 1, name: 'baseline', sql: baselineSql },
  { version: 2, name: 'community_nickname', sql: communityNicknameSql },
  {
    version: 3,
    name: 'social_rearchitecture',
    sql: socialRearchitectureSql,
    statements: socialRearchitectureStatements,
    destructive: true,
  },
  { version: 4, name: 'treehole_post_media', sql: treeholePostMediaSql },
  { version: 5, name: 'community_bio', sql: communityBioSql },
  { version: 6, name: 'early_rising', sql: earlyRisingSql },
];
