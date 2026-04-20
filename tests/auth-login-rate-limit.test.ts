import { beforeEach, describe, expect, it } from 'bun:test';
import { config } from '../src/config.ts';
import {
  getAuthLoginRateLimitStatus,
  recordAuthLoginFailure,
  resetAuthLoginRateLimit,
  resetAuthLoginRateLimitStateForTests,
} from '../src/middleware/auth-login-rate-limit.middleware.ts';

describe('登录失败限流', () => {
  beforeEach(() => {
    resetAuthLoginRateLimitStateForTests();
  });

  it('同一学号连续失败达到阈值后会被锁定', () => {
    const now = 1_000_000;

    for (let index = 1; index < config.authLoginRateLimit.maxFailures; index += 1) {
      const status = recordAuthLoginFailure('20240001', now + index * 1000);
      expect(status.limited).toBe(false);
      expect(status.failureCount).toBe(index);
    }

    const locked = recordAuthLoginFailure(
      '20240001',
      now + config.authLoginRateLimit.maxFailures * 1000
    );

    expect(locked.limited).toBe(true);
    expect(locked.failureCount).toBe(config.authLoginRateLimit.maxFailures);
    expect(locked.retryAfterSeconds).toBe(Math.ceil(config.authLoginRateLimit.blockMs / 1000));

    const blocked = getAuthLoginRateLimitStatus(
      '20240001',
      now + config.authLoginRateLimit.maxFailures * 1000 + 500
    );
    expect(blocked.limited).toBe(true);
    expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(Math.ceil(config.authLoginRateLimit.blockMs / 1000));
  });

  it('登录成功后会清空该学号的失败状态', () => {
    const now = 2_000_000;

    for (let index = 0; index < config.authLoginRateLimit.maxFailures; index += 1) {
      recordAuthLoginFailure('20240002', now + index * 1000);
    }

    resetAuthLoginRateLimit('20240002');

    const status = getAuthLoginRateLimitStatus('20240002', now + 10_000);
    expect(status.limited).toBe(false);
    expect(status.failureCount).toBe(0);
  });

  it('未达到锁定阈值的失败窗口会在过期后自动清空', () => {
    const now = 3_000_000;

    recordAuthLoginFailure('20240003', now);
    recordAuthLoginFailure('20240003', now + 1_000);

    const status = getAuthLoginRateLimitStatus(
      '20240003',
      now + config.authLoginRateLimit.windowMs + 1_000
    );

    expect(status.limited).toBe(false);
    expect(status.failureCount).toBe(0);
  });
});
