/**
 * [INPUT]: 依赖既有 HttpClient、AuthEngine、TicketExchanger、CredentialManager、UserService、config 与 Logger
 * [OUTPUT]: 对外提供 LegacyCampusLoginAdapter，实现校园登录、恢复标记与 Portal 资料 ports
 * [POS]: identity/infrastructure 的旧系统防腐层，把下一阶段待迁移的校园集成挡在 application 边界之外
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { AuthEngine } from '../../../auth/auth-engine';
import { CredentialManager } from '../../../auth/credential-manager';
import { TicketExchanger } from '../../../auth/ticket-exchanger';
import { config } from '../../../config';
import { HttpClient } from '../../../core/http-client';
import { UserService } from '../../../services/portal/user-service';
import { Logger } from '../../../utils/logger';
import type {
  CampusLoginPort,
  CampusSession,
  LoginRecoveryPort,
  UserProfilePort,
} from '../application/login.ports';

function unwrap(session: CampusSession): HttpClient {
  if (!(session.opaque instanceof HttpClient)) throw new Error('INVALID_CAMPUS_SESSION');
  return session.opaque;
}

function wrap(client: HttpClient): CampusSession {
  return { opaque: client };
}

export class LegacyCampusLoginAdapter implements CampusLoginPort, LoginRecoveryPort, UserProfilePort {
  async start() {
    const client = new HttpClient(undefined, config.timeout.cas);
    const execution = await new AuthEngine(client).getExecution();
    return { session: wrap(client), execution };
  }

  restore(snapshot: string): CampusSession {
    const client = HttpClient.fromSerializedJar(snapshot);
    client.setTimeout(config.timeout.cas);
    return wrap(client);
  }

  snapshot(session: CampusSession): string {
    return unwrap(session).serializeJar();
  }

  login(input: Parameters<CampusLoginPort['login']>[0]) {
    const client = unwrap(input.session);
    return new AuthEngine(client).login(input.username, input.password, input.captcha, input.execution);
  }

  getCaptcha(session: CampusSession): Promise<ArrayBuffer> {
    return new AuthEngine(unwrap(session)).getCaptcha();
  }

  getExecution(session: CampusSession): Promise<string | null> {
    return new AuthEngine(unwrap(session)).getExecution();
  }

  exchangePortalToken(session: CampusSession) {
    return TicketExchanger.exchangePortalToken(unwrap(session));
  }

  exchangeJwSession(session: CampusSession) {
    return TicketExchanger.exchangeJwSession(unwrap(session));
  }

  requiresInteractiveLogin(userId: number): Promise<boolean> {
    return CredentialManager.requiresInteractiveLogin(userId);
  }

  async backfill(userId: number, studentId: string) {
    try {
      const profile = await UserService.getUserInfo(userId, studentId, true);
      return {
        name: profile.data?.name,
        className: profile.data?.className,
      };
    } catch (error: any) {
      Logger.warn('Auth', '用户信息获取失败，继续登录', error?.message || String(error), studentId);
      throw error;
    }
  }
}
