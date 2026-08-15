/**
 * [INPUT]: 依赖调用方给出的毫秒或 legacy 秒级 TTL
 * [OUTPUT]: 对外提供 FreshnessPolicy、永久策略、legacy 转换与过期时间计算
 * [POS]: cache/domain 的新鲜度唯一事实源，明确 ttlMs=0 永不自动过期
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export interface FreshnessPolicy {
  readonly ttlMs: number;
}

export const NEVER_EXPIRES: FreshnessPolicy = Object.freeze({ ttlMs: 0 });

export function freshnessPolicy(ttlMs: number): FreshnessPolicy {
  if (!Number.isFinite(ttlMs) || ttlMs < 0) {
    throw new TypeError('ttlMs 必须是非负有限数值');
  }
  return ttlMs === 0 ? NEVER_EXPIRES : Object.freeze({ ttlMs });
}

export function fromLegacyTtlSeconds(ttlSeconds: number): FreshnessPolicy {
  // 语义约定：ttl=0 表示“永久缓存 + 仅显式 refresh 回源”，是业务层的有意选择而非缺省兜底；
  // 需要自动过期的键必须显式传正数 TTL。
  return ttlSeconds > 0 ? freshnessPolicy(ttlSeconds * 1000) : NEVER_EXPIRES;
}

export function expiresAtFor(policy: FreshnessPolicy, now: Date): Date | null {
  return policy.ttlMs === 0 ? null : new Date(now.getTime() + policy.ttlMs);
}
