/**
 * [INPUT]: 依赖 Portal 目标恢复、两个派生会话协议/仓储及统一独立等待与有限执行
 * [OUTPUT]: 对外提供内部 mobileJwRecovery/mobileYxtRecovery，仅共享不可变会话快照
 * [POS]: SchoolAccess 的 Portal 派生恢复协调；交换条件写 epoch，父拒绝按原快照删除，客户端归调用方
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */
import { MobileJwAuthExchanger } from '../mobile-jw/auth-exchanger';
import { MobileJwError } from '../mobile-jw/errors';
import { mobileJwSessionRepository } from '../mobile-jw/session-repository';
import { MobileYxtAuthExchanger } from '../mobile-yxt/auth-exchanger';
import { isMobileYxtCredentialRejected } from '../mobile-yxt/mobile-yxt-errors';
import { mobileYxtSessionRepository } from '../mobile-yxt/session-repository';
import { schoolUnavailable } from './errors';
import { schoolRecovery } from './recovery';
import { SharedSchoolFlights, schoolRequestExecutor, type SchoolRequestContext } from './request-executor';
import { schoolStateStore } from './state-store';

interface DerivedSessionProtocol<S, E> {
  read(userId: number): Promise<S | null>;
  exchange(portalJwt: string, deadlineAt: number): Promise<E>;
  commit(userId: number, epoch: number, exchanged: E): Promise<S | null>;
  parentRejected(error: unknown): boolean;
}

class DerivedRecovery<S extends object, E> {
  private readonly flights = new SharedSchoolFlights();
  constructor(private readonly protocol: DerivedSessionProtocol<S, E>) {}

  async ensure(userId: number, waiter: SchoolRequestContext): Promise<Readonly<S>> {
    const stored = await this.protocol.read(userId);
    if (stored) return Object.freeze(stored);
    return this.flights.run(String(userId), waiter, async context => {
      const current = await this.protocol.read(userId);
      if (current) return Object.freeze(current);
      let parentRecoveryAttempted = false;
      for (let conflict = 0; conflict < 2; conflict += 1) {
        const parent = await schoolRecovery.ensure(userId, 'portal_jwt', context);
        let exchanged: E;
        try {
          exchanged = await schoolRequestExecutor.step(context, () => this.protocol.exchange(parent.value!, context.deadlineAt));
        } catch (error) {
          if (!this.protocol.parentRejected(error)) throw error;
          schoolStateStore.invalidate(parent);
          if (parentRecoveryAttempted) throw schoolUnavailable();
          parentRecoveryAttempted = true;
          conflict -= 1;
          continue;
        }
        const created = await this.protocol.commit(userId, parent.epoch, exchanged);
        if (created) return Object.freeze(created);
        const latest = await this.protocol.read(userId);
        if (latest) return Object.freeze(latest);
      }
      throw schoolUnavailable();
    });
  }
}

const jwExchange = new MobileJwAuthExchanger();
export const mobileJwRecovery = new DerivedRecovery({
  read: (userId: number) => mobileJwSessionRepository.read(userId),
  exchange: (token: string, deadline: number) => jwExchange.exchange(token, deadline),
  commit: (userId: number, epoch: number, token: string) => mobileJwSessionRepository.createIfLoginEpochMatches(userId, epoch, token),
  parentRejected: (error: unknown) => error instanceof MobileJwError && error.kind === 'credential',
});

const yxtExchange = new MobileYxtAuthExchanger();
export const mobileYxtRecovery = new DerivedRecovery({
  read: (userId: number) => mobileYxtSessionRepository.read(userId),
  exchange: (token: string, deadline: number) => yxtExchange.exchange(token, deadline),
  commit: (userId: number, epoch: number, exchanged: Awaited<ReturnType<MobileYxtAuthExchanger['exchange']>>) =>
    mobileYxtSessionRepository.createIfLoginEpochMatches({ userId, expectedLoginEpoch: epoch, ...exchanged }),
  parentRejected: isMobileYxtCredentialRejected,
});
