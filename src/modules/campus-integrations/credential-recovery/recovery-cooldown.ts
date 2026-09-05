/**
 * [INPUT]: 依赖调用方提供的学校登录 epoch reader 与当前时间，不访问学校或持久化凭证
 * [OUTPUT]: 对外提供 RecoveryCooldown/RecoveryScope，按用户、能力和登录代次保存固定五秒失败窗口
 * [POS]: credential-recovery 的进程内失败节流；重放原有错误语义，真实登录换代自动淘汰旧窗口，读取不续期
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export type RecoveryScope = 'cas_tgc' | 'portal_jwt' | 'jw_session';
const RECOVERY_COOLDOWN_MS = 5_000;
const MAX_COOLDOWN_ENTRIES = 4_096;

interface CooldownEntry {
  epoch: number;
  retryAt: number;
  error: unknown;
}

export class RecoveryCooldown {
  private readonly entries = new Map<string, CooldownEntry>();

  constructor(private readonly readEpoch: (userId: number) => number) {}

  read(userId: number, scope: RecoveryScope): CooldownEntry | null {
    const key = `${userId}:${scope}`;
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (entry.epoch !== this.readEpoch(userId) || entry.retryAt <= Date.now()) {
      this.entries.delete(key);
      return null;
    }
    return entry;
  }

  record(userId: number, scope: RecoveryScope, epoch: number, error: unknown = null): void {
    if (this.readEpoch(userId) !== epoch) return;
    // 并发失败或外层传播不能延长已开始的窗口；瞬态错误仍按原错误向上传播。
    const existing = this.read(userId, scope);
    if (existing) return;
    const now = Date.now();
    for (const [key, entry] of this.entries) {
      if (entry.retryAt <= now) this.entries.delete(key);
    }
    if (this.entries.size >= MAX_COOLDOWN_ENTRIES) {
      this.entries.delete(this.entries.keys().next().value!);
    }
    this.entries.set(`${userId}:${scope}`, { epoch, retryAt: now + RECOVERY_COOLDOWN_MS, error });
  }

  clear(userId: number): void {
    for (const scope of ['cas_tgc', 'portal_jwt', 'jw_session'] as const) {
      this.entries.delete(`${userId}:${scope}`);
    }
  }
}
