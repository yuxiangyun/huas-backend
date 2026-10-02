/**
 * [INPUT]: 依赖 Portal 目标恢复、两个派生会话协议/仓储、能力级固定 epoch 冷却及统一独立等待与有限执行
 * [OUTPUT]: 对外提供内部 mobileJwRecovery/mobileYxtRecovery，仅共享不可变会话快照，按能力冷却实际失败并等待恢复收尾
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
import { RecoveryCooldown } from './recovery-cooldown';

interface DerivedSessionProtocol<S, E> {
  read(userId: number): Promise<S | null>;
  exchange(portalJwt: string, deadlineAt: number): Promise<E>;
  commit(userId: number, epoch: number, exchanged: E): Promise<S | null>;
  parentRejected(error: unknown): boolean;
}

class DerivedRecovery<S extends object, E> {
  private readonly flights = new SharedSchoolFlights();
  private readonly cooldown = new RecoveryCooldown(userId => schoolStateStore.epoch(userId));
  constructor(private readonly scope: 'mobile_jw' | 'mobile_yxt', private readonly protocol: DerivedSessionProtocol<S, E>) {}

  drain(): Promise<void> { return this.flights.drain(); }

  async ensure(userId: number, waiter: SchoolRequestContext): Promise<Readonly<S>> {
    const stored = await this.protocol.read(userId);
    if (stored) return Object.freeze(stored);
    return this.flights.run(String(userId), waiter, async context => {
      const current = await this.protocol.read(userId);
      if (current) return Object.freeze(current);
      const cooling = this.cooldown.read(userId, this.scope);
      if (cooling) throw cooling.error ?? schoolUnavailable();
      let parentRecoveryAttempted = false;
      for (let conflict = 0; conflict < 2; conflict += 1) {
        // 父恢复失败属于父能力；本能力不能将等待超时写成自己的账号故障。
        const parent = await schoolRecovery.ensure(userId, 'portal_jwt', context);
        let exchanged: E;
        let exchangeStarted = false;
        try {
          exchanged = await schoolRequestExecutor.step(context, () => {
            exchangeStarted = true;
            return this.protocol.exchange(parent.value!, context.deadlineAt);
          });
        } catch (error) {
          if (!this.protocol.parentRejected(error)) {
            if (exchangeStarted) this.cooldown.record(userId, this.scope, parent.epoch, error);
            throw error;
          }
          schoolStateStore.invalidate(parent);
          if (parentRecoveryAttempted) {
            const failure = schoolUnavailable('学校未能建立本次查询所需的连接，可能尚未完成学校账号初始化。请先进入学校官方系统，按提示完成初始化后再返回重试。');
            this.cooldown.record(userId, this.scope, parent.epoch, failure);
            throw failure;
          }
          parentRecoveryAttempted = true;
          conflict -= 1;
          continue;
        }
        let created: S | null;
        try {
          created = await this.protocol.commit(userId, parent.epoch, exchanged);
        } catch (error) {
          this.cooldown.record(userId, this.scope, parent.epoch, error);
          throw error;
        }
        if (created) return Object.freeze(created);
        const latest = await this.protocol.read(userId);
        if (latest) return Object.freeze(latest);
      }
      // 条件提交拒绝说明本轮 epoch 已被替代，不能把旧结果记为新代次的故障。
      throw schoolUnavailable();
    });
  }
}

const jwExchange = new MobileJwAuthExchanger();
export const mobileJwRecovery = new DerivedRecovery('mobile_jw', {
  read: (userId: number) => mobileJwSessionRepository.read(userId),
  exchange: (token: string, deadline: number) => jwExchange.exchange(token, deadline),
  commit: (userId: number, epoch: number, token: string) => mobileJwSessionRepository.createIfLoginEpochMatches(userId, epoch, token),
  parentRejected: (error: unknown) => error instanceof MobileJwError && error.kind === 'credential',
});

const yxtExchange = new MobileYxtAuthExchanger();
export const mobileYxtRecovery = new DerivedRecovery('mobile_yxt', {
  read: (userId: number) => mobileYxtSessionRepository.read(userId),
  exchange: (token: string, deadline: number) => yxtExchange.exchange(token, deadline),
  commit: (userId: number, epoch: number, exchanged: Awaited<ReturnType<MobileYxtAuthExchanger['exchange']>>) =>
    mobileYxtSessionRepository.createIfLoginEpochMatches({ userId, expectedLoginEpoch: epoch, ...exchanged }),
  parentRejected: isMobileYxtCredentialRejected,
});
