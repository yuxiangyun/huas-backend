/**
 * [INPUT]: 依赖 ClassroomApplicationPorts、纯参数规范化、统一错误语义与审计日志
 * [OUTPUT]: 对外提供 ClassroomFreeApplicationService，以服务账号调用具名学校读取，将该账号认证失效投影为服务不可用
 * [POS]: Academic 空教室用例，保留用户审计身份与上游服务账号的分离，不接触 HTTP 或凭证
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */
import { Logger } from '../../../utils/logger';
import { AppError, ErrorCode } from '../../../utils/errors';
import { normalizeCampusId, normalizeFreeQuery, type ClassroomApplicationPorts, type ClassroomQueryActor, type FreeQuery } from '../domain/classroom';
const QUERY_META = { cached: false, source: 'jw', upstreamAccount: 'admin' } as const;
export class ClassroomFreeApplicationService {
  constructor(private readonly ports: ClassroomApplicationPorts) {}
  async getBuildings(rawCampusId: string | undefined, actor: ClassroomQueryActor) {
    const campusId = normalizeCampusId(rawCampusId);
    const data = await this.readWithServiceAccount((account) => this.ports.readBuildings(account, { campusId }));
    Logger.operation('ClassroomFreeQuery', 'buildings', actor.studentId, actor.name, `actorUserId=${actor.userId} upstreamAccount=admin campus=${campusId} term=${data.term} buildings=${data.buildings.length}`);
    return { data, _meta: QUERY_META };
  }
  async getFreeRooms(query: FreeQuery, actor: ClassroomQueryActor) {
    const input = normalizeFreeQuery(query);
    const data = await this.readWithServiceAccount((account) => this.ports.readFreeRooms(account, input));
    Logger.operation('ClassroomFreeQuery', 'query', actor.studentId, actor.name, `actorUserId=${actor.userId} upstreamAccount=admin campus=${data.campusId} building=${data.buildingId} week=${data.week} weekday=${data.weekday} sections=${data.startSection}-${data.endSection}`);
    return { data, _meta: QUERY_META };
  }

  private async readWithServiceAccount<T>(read: (account: number) => Promise<T>): Promise<T> {
    const account = await this.ports.resolveServiceAccountUserId();
    try {
      return await read(account);
    } catch (error) {
      if (error instanceof AppError && error.code === ErrorCode.CREDENTIAL_EXPIRED) {
        throw new AppError(ErrorCode.SERVICE_ACCOUNT_UNAVAILABLE, '空教室服务账号需要重新认证，请稍后重试');
      }
      throw error;
    }
  }
}
