/**
 * [INPUT]: 依赖 ClassroomFreeApplicationService、SchoolAccess 具名空教室操作、服务账号持久化适配器与 config
 * [OUTPUT]: 对外提供兼容静态 ClassroomFreeService 与 adminStudentId getter
 * [POS]: academic 的 Classrooms composition root，唯一负责空教室 application 与 infrastructure 装配
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { config } from '../../config';
import { ClassroomFreeApplicationService } from './application/classroom-free-service';
import { schoolAccess } from '../campus-integrations/school-access/school-access';
import { resolveClassroomServiceAccountUserId } from './infrastructure/classroom-service-account';

const classroomApplication = new ClassroomFreeApplicationService({
  readBuildings: (userId, input) => schoolAccess.execute(userId, { name: 'jw.classrooms.buildings', input }),
  readFreeRooms: (userId, input) => schoolAccess.execute(userId, { name: 'jw.classrooms.free', input }),
  resolveServiceAccountUserId: resolveClassroomServiceAccountUserId,
});

export class ClassroomFreeService {
  static get adminStudentId() {
    return config.schoolService.classroomAdminStudentId;
  }

  static getBuildings(...args: Parameters<ClassroomFreeApplicationService['getBuildings']>) {
    return classroomApplication.getBuildings(...args);
  }

  static getFreeRooms(...args: Parameters<ClassroomFreeApplicationService['getFreeRooms']>) {
    return classroomApplication.getFreeRooms(...args);
  }
}
