/**
 * [INPUT]: 依赖各编号 migration 的不可变 SQL
 * [OUTPUT]: 对外提供按版本严格排序的 MIGRATIONS 清单与 Migration 类型
 * [POS]: migrations 的唯一注册表，隔离迁移发现顺序与执行引擎
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { baselineSql } from './0001_baseline';

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

export const MIGRATIONS: readonly Migration[] = [
  { version: 1, name: 'baseline', sql: baselineSql },
];
