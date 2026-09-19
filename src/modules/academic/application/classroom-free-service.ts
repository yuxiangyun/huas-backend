/**
 * [INPUT]: 依赖 ClassroomApplicationPorts、纯参数规范化与统一审计日志
 * [OUTPUT]: 对外提供 ClassroomFreeApplicationService，以服务账号调用具名学校读取
 * [POS]: Academic 空教室用例，保留用户审计身份与上游服务账号的分离，不接触 HTTP 或凭证
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */
import { Logger } from '../../../utils/logger';
import { normalizeCampusId, normalizeFreeQuery, type ClassroomApplicationPorts, type ClassroomQueryActor, type FreeQuery } from '../domain/classroom';
const QUERY_META = { cached: false, source: 'jw', upstreamAccount: 'admin' } as const;
export class ClassroomFreeApplicationService {
  constructor(private readonly ports: ClassroomApplicationPorts) {}
  async getBuildings(rawCampusId: string | undefined, actor: ClassroomQueryActor) {
    const campusId = normalizeCampusId(rawCampusId);
    const account = await this.ports.resolveServiceAccountUserId();
    const data = await this.ports.readBuildings(account, { campusId });
    Logger.operation('ClassroomFreeQuery', 'buildings', actor.studentId, actor.name, `actorUserId=${actor.userId} upstreamAccount=admin campus=${campusId} term=${data.term} buildings=${data.buildings.length}`);
    return { data, _meta: QUERY_META };
  }
  async getFreeRooms(query: FreeQuery, actor: ClassroomQueryActor) {
    const input = normalizeFreeQuery(query);
    const account = await this.ports.resolveServiceAccountUserId();
    const data = await this.ports.readFreeRooms(account, input);
    Logger.operation('ClassroomFreeQuery', 'query', actor.studentId, actor.name, `actorUserId=${actor.userId} upstreamAccount=admin campus=${data.campusId} building=${data.buildingId} week=${data.week} weekday=${data.weekday} sections=${data.startSection}-${data.endSection}`);
    return { data, _meta: QUERY_META };
  }
}
