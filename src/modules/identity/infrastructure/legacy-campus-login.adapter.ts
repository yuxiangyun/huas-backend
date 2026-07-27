/**
 * [INPUT]: 直接依赖 campus-integrations 的 HttpClient、CAS 换票、凭证恢复与 Portal 用户资料 canonical 实现
 * [OUTPUT]: 对外提供 LegacyCampusLoginAdapter，实现校园登录、恢复标记与 Portal 资料 ports
 * [POS]: identity/infrastructure 的校园登录端口适配器，单向消费 Campus Integrations 且不泄漏上游细节
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { AuthEngine } from '../../campus-integrations/cas/auth-engine';
import { CredentialManager } from '../../campus-integrations/credential-recovery/credential-manager';
import { TicketExchanger } from '../../campus-integrations/cas/ticket-exchanger';
import { config } from '../../../config';
import { HttpClient } from '../../campus-integrations/http/http-client';
import { UserService } from '../../campus-integrations/portal/user-service';
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
