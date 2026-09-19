/**
 * [INPUT]: 依赖单次 CAS/TGC 协议、条件状态仓储、用户级 CAS 合流、目标合流及固定 epoch 冷却
 * [OUTPUT]: 对外提供内部 SchoolRecovery.ensure，按 CAS→JW/Portal 目标依赖返回不可变凭证快照
 * [POS]: SchoolAccess 唯一恢复协调器，父认证与目标能力分别合流；调用方预算只限制等待
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */
import { config } from '../../../config';
import { CryptoHelper } from '../../../utils/crypto';
import { AuthEngine } from '../cas/auth-engine';
import { TicketExchanger } from '../cas/ticket-exchanger';
import { RecoveryCooldown } from './recovery-cooldown';
import { HttpClient } from '../http/http-client';
import { authenticationAttempts } from './authentication-attempts';
import { interactionRequired, normalizeSchoolFailure, schoolTimeout, schoolUnavailable } from './errors';
import { SharedSchoolFlights, schoolRequestExecutor, type SchoolRequestContext } from './request-executor';
import { schoolStateStore, type BaseSchoolTarget, type SchoolCredentialSnapshot } from './state-store';

export class SchoolRecovery {
  private readonly flights = new SharedSchoolFlights();
  private readonly cooldown = new RecoveryCooldown(userId => schoolStateStore.epoch(userId));

  async ensure(userId: number, target: BaseSchoolTarget, waiter: SchoolRequestContext): Promise<SchoolCredentialSnapshot> {
    const cached = schoolStateStore.read(userId, target);
    if (cached) return cached;
    return this.flights.run(`${userId}:${target}`, waiter, async context => {
      const current = schoolStateStore.read(userId, target);
      if (current) return current;
      if (schoolStateStore.requiresInteraction(userId)) throw interactionRequired();
      const cooling = this.cooldown.read(userId, target);
      if (cooling) throw cooling.error ?? schoolUnavailable();
      let epoch = schoolStateStore.epoch(userId);
      try {
        if (target === 'cas_tgc') return await this.authenticateStored(userId, epoch, context);
        const result = await this.acquireTarget(userId, target, context, updated => { epoch = updated; });
        return result;
      } catch (error) {
        const fresh = schoolStateStore.read(userId, target);
        if (fresh) return fresh;
        const failure = normalizeSchoolFailure(error);
        // 父 CAS 已记录自己的故障；目标不能把父故障或旧 epoch 等待超时扩散为新账号状态。
        if (target === 'cas_tgc' || !this.cooldown.read(userId, 'cas_tgc')) this.cooldown.record(userId, target, epoch, failure);
        throw failure;
      }
    });
  }

  private async acquireTarget(userId: number, target: 'portal_jwt' | 'jw_session', context: SchoolRequestContext, observeEpoch: (epoch: number) => void): Promise<SchoolCredentialSnapshot> {
    let parent = await this.ensure(userId, 'cas_tgc', context);
    observeEpoch(parent.epoch);
    let authenticatedAgain = false;
    // 普通 TGC 轮换冲突只补一次；明确父凭证拒绝才可重新认证一次。
    for (let conflict = 0; conflict < 2; conflict += 1) {
      const existing = schoolStateStore.read(userId, target);
      if (existing) return existing;
      const exchanged = await schoolRequestExecutor.step(context, async () => {
        const client = HttpClient.fromSerializedJar(parent.cookieJar!, context.deadlineAt);
        if (target === 'portal_jwt') {
          const result = await TicketExchanger.exchangePortalToken(client);
          return { parentRejected: result.parentRejected, value: result.token, jar: client.serializeJar() };
        }
        const result = await TicketExchanger.exchangeJwSession(client);
        return { parentRejected: result.parentRejected, value: null, jar: client.serializeJar() };
      }, true, target === 'jw_session' ? context.config.retry.jwActivationMax : context.config.retry.businessMaxAttempts);
      if (exchanged.parentRejected) {
        schoolStateStore.invalidate(parent);
        if (authenticatedAgain) throw schoolUnavailable();
        authenticatedAgain = true;
        parent = await this.ensure(userId, 'cas_tgc', context);
        observeEpoch(parent.epoch);
        conflict -= 1;
        continue;
      }
      const committed = schoolStateStore.commitExchange(parent, target, exchanged.jar, exchanged.value);
      if (committed) return committed;
      const latest = schoolStateStore.read(userId, target);
      if (latest) return latest;
      const nextParent = schoolStateStore.read(userId, 'cas_tgc');
      if (!nextParent || nextParent.epoch !== parent.epoch) throw schoolUnavailable();
      parent = nextParent;
    }
    throw schoolTimeout();
  }

  private async authenticateStored(userId: number, epoch: number, context: SchoolRequestContext): Promise<SchoolCredentialSnapshot> {
    const account = schoolStateStore.account(userId);
    if (!account?.encryptedPassword) throw schoolUnavailable();
    const password = CryptoHelper.decryptAES(account.encryptedPassword, config.jwtSecret);
    if (!password) throw schoolUnavailable();
    const attempt = authenticationAttempts.begin(account.studentId);
    const current = () => {
      const latest = schoolStateStore.read(userId, 'cas_tgc');
      if (latest) return latest;
      throw schoolUnavailable();
    };
    try {
      const client = new HttpClient(undefined, context.config.timeout.cas);
      client.setDeadline(context.deadlineAt);
      const engine = new AuthEngine(client);
      await schoolRequestExecutor.step(context, () => engine.getCaptcha());
      const execution = await schoolRequestExecutor.step(context, () => engine.getExecution());
      if (!execution) throw schoolUnavailable();
      if (schoolStateStore.epoch(userId) !== epoch) return current();
      const result = await schoolRequestExecutor.step(context, () => engine.login(account.studentId, password, '', execution), false);
      if (schoolStateStore.epoch(userId) !== epoch) return current();
      if (!result.success) {
        if (result.needCaptcha || result.credentialsRejected) {
          if (schoolStateStore.markInteraction(userId, epoch, result.needCaptcha ? 'captcha_required' : 'credentials_rejected')) throw interactionRequired();
          return current();
        }
        throw schoolUnavailable();
      }
      schoolStateStore.commitAuthentication({ attempt, encryptedPassword: account.encryptedPassword, casCookieJar: client.serializeJar(), portalToken: result.portalToken || null, expectedEpoch: epoch });
      return current();
    } finally { authenticationAttempts.finish(attempt); }
  }
}
export const schoolRecovery = new SchoolRecovery();
