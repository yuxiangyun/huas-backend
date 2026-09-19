/**
 * [INPUT]: 依赖目标恢复快照、条件仓储及统一请求执行器
 * [OUTPUT]: 对外提供内部 executeBaseRead，将 Portal/JW 只读协议限制在一次恢复重放内
 * [POS]: SchoolAccess 基础系统操作的内部组合点，客户端在每个请求独立创建且不交给业务层
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */
import { HttpClient } from '../http/http-client';
import { SchoolAccessError, sessionRejected } from './errors';
import { schoolRecovery } from './recovery';
import { schoolRequestExecutor, type SchoolRequestContext } from './request-executor';
import { schoolStateStore, type SchoolCredentialSnapshot } from './state-store';

export interface BaseSchoolSession { client: Pick<HttpClient, 'request'>; snapshot: SchoolCredentialSnapshot }
export function executeBaseRead<T>(userId: number, target: 'portal_jwt' | 'jw_session', context: SchoolRequestContext, read: (session: BaseSchoolSession) => Promise<T>): Promise<T> {
  return schoolRequestExecutor.operation(context, {
    resolve: async () => {
      const snapshot = await schoolRecovery.ensure(userId, target, context);
      const client = snapshot.cookieJar ? HttpClient.fromSerializedJar(snapshot.cookieJar, context.deadlineAt) : new HttpClient();
      client.setDeadline(context.deadlineAt);
      const protocolClient: Pick<HttpClient, 'request'> = {
        request: async (url, options) => {
          const response = await client.request(url, options);
          // Portal/JW 保留已有认证状态证据；mobile 在各自协议中独立判定。
          if (response.status === 401 || response.status === 403
            || (response.status === 302 && response.headers.get('location')?.includes('cas/login'))) throw sessionRejected();
          if (response.status >= 500) throw new SchoolAccessError('unavailable', '学校服务暂不可用，请稍后重试', true);
          return response;
        },
      };
      return { client: protocolClient, snapshot };
    },
    invalidate: session => schoolStateStore.invalidate(session.snapshot),
    run: read,
    replayable: true,
  });
}
