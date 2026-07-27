/**
 * [INPUT]: 依赖 node:crypto 的 SHA-256 与规范化成绩查询维度
 * [OUTPUT]: 对外提供 buildGradeCacheKey，生成固定长度且不泄漏原始查询的用户缓存键
 * [POS]: academic/infrastructure 的成绩缓存寻址适配器，保持每用户前缀限额可执行
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { createHash } from 'node:crypto';

export function buildGradeCacheKey(studentId: string, term: string, kcxz: string, kcmc: string): string {
  const fingerprint = createHash('sha256')
    .update(`${term}\u0000${kcxz}\u0000${kcmc}`)
    .digest('hex')
    .slice(0, 32);
  return `grades:${studentId}:${fingerprint}`;
}
