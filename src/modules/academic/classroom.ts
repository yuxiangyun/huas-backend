/**
 * [INPUT]: 依赖 ClassroomFreeApplicationService、默认 Academic upstream、服务账号持久化适配器与 config
 * [OUTPUT]: 对外提供兼容静态 ClassroomFreeService 与 adminStudentId getter
 * [POS]: academic 的 Classrooms composition root，唯一负责空教室 application 与 infrastructure 装配
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { config } from '../../config';
import { ClassroomFreeApplicationService } from './application/classroom-free-service';
import { defaultAcademicRuntimePorts } from './infrastructure/runtime';
import { resolveClassroomServiceAccountUserId } from './infrastructure/classroom-service-account';

const classroomApplication = new ClassroomFreeApplicationService({
  upstream: defaultAcademicRuntimePorts.upstream,
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
