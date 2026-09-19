/**
 * [INPUT]: 依赖启动时的环境变量快照，读取登录限流和学校请求重试设置
 * [OUTPUT]: 对外提供不可变 runtimeConfig/RuntimeConfig，集中校验整数、单位、零值及组合约束
 * [POS]: 认证与学校访问的静态规则源；业务动态策略、凭证和在途状态由各自模块保存
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

function integer(env: NodeJS.ProcessEnv, key: string, fallback: number, minimum = 1): number {
  const raw = env[key];
  if (raw === undefined) return fallback;
  const value = Number(raw);
  if (raw.trim() === '' || !Number.isSafeInteger(value) || value < minimum || value > 2_147_483_647) {
    throw new Error(`INVALID_RUNTIME_CONFIG:${key}`);
  }
  return value;
}

function parseRuntimeConfig(env: NodeJS.ProcessEnv) {
  const retry = Object.freeze({
    jwActivationMax: 3,
    businessMaxAttempts: integer(env, 'BUSINESS_RETRY_MAX_ATTEMPTS', 2),
    businessBaseDelayMs: integer(env, 'BUSINESS_RETRY_BASE_DELAY_MS', 200, 0),
    businessMaxDelayMs: integer(env, 'BUSINESS_RETRY_MAX_DELAY_MS', 800, 0),
    businessJitterMs: integer(env, 'BUSINESS_RETRY_JITTER_MS', 100, 0),
  });
  if (retry.businessMaxDelayMs < retry.businessBaseDelayMs) throw new Error('INVALID_RUNTIME_CONFIG:BUSINESS_RETRY_MAX_DELAY_MS');
  return Object.freeze({
    retry,
    ttl: Object.freeze({ tgc: 7 * 86_400_000, portalJwt: 7 * 86_400_000, jwSession: 7 * 86_400_000, selfJwt: 90 * 86_400_000 }),
    timeout: Object.freeze({ cas: 2_000, business: 4_000, gradeFreshBudget: 45_000, mobileYxtTotalBudget: 20_000, mobileJwTotalBudget: 45_000 }),
    authLoginRateLimit: Object.freeze({
      maxFailures: integer(env, 'AUTH_LOGIN_RATE_LIMIT_MAX_FAILURES', 20),
      windowMs: integer(env, 'AUTH_LOGIN_RATE_LIMIT_WINDOW_MS', 5 * 60_000),
      blockMs: integer(env, 'AUTH_LOGIN_RATE_LIMIT_BLOCK_MS', 10 * 60_000),
    }),
    school: Object.freeze({ totalBudgetMs: 45_000, recoveryBudgetMs: 45_000, cooldownMs: 5_000, maxCooldownEntries: 4_096 }),
    captcha: Object.freeze({ ttlMs: 10 * 60_000, maxChallenges: 1_000 }),
  });
}

export const runtimeConfig = parseRuntimeConfig(process.env);
export type RuntimeConfig = typeof runtimeConfig;
