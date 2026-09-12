/**
 * [INPUT]: 依赖课表/策略 application service、文件策略 store、MobileJwScheduleClient、config 与 defaultAcademicRuntimePorts
 * [OUTPUT]: 对外提供兼容课表静态类、ScheduleFacade 移动教务整学期采集、来源策略及用户首选来源校验
 * [POS]: academic 的 Schedule composition root，唯一负责单源读取、三源编排、日历移动教务单源入口与热策略持久化装配
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { MobileJwScheduleApplicationService } from './application/mobile-jw-schedule-service';
import { MobileJwSemesterApplicationService } from './application/mobile-jw-semester-service';
import { MobileJwScheduleClient } from '../campus-integrations/mobile-jw/schedule-client';
import { ScheduleApplicationService } from './application/schedule-service';
import { PortalScheduleApplicationService } from './application/portal-schedule-service';
import { ScheduleFacadeApplicationService } from './application/schedule-facade';
import { ScheduleSourcePolicyApplicationService } from './application/schedule-source-policy-service';
import { config } from '../../config';
import { defaultAcademicRuntimePorts } from './infrastructure/runtime';
import { FileScheduleSourcePolicyStore } from './infrastructure/file-schedule-source-policy-store';

const scheduleApplication = new ScheduleApplicationService(defaultAcademicRuntimePorts);
const portalScheduleApplication = new PortalScheduleApplicationService(defaultAcademicRuntimePorts);
const mobileJwSemesterApplication = new MobileJwSemesterApplicationService(new MobileJwScheduleClient());
const scheduleSourcePolicyStore = new FileScheduleSourcePolicyStore(
  config.scheduleSourcePolicy.stateFile,
  config.scheduleSourcePolicy.environmentMode,
);
export const scheduleSourcePolicyApplicationService = new ScheduleSourcePolicyApplicationService(scheduleSourcePolicyStore);
const scheduleFacadeApplication = new ScheduleFacadeApplicationService(
  scheduleApplication,
  portalScheduleApplication,
  scheduleSourcePolicyApplicationService,
  new MobileJwScheduleApplicationService(new MobileJwScheduleClient(), defaultAcademicRuntimePorts),
);

export class ScheduleService {
  static getSchedule(...args: Parameters<ScheduleApplicationService['getSchedule']>) {
    return scheduleApplication.getSchedule(...args);
  }
}

export class PortalScheduleService {
  static getSchedule(...args: Parameters<PortalScheduleApplicationService['getSchedule']>) {
    return portalScheduleApplication.getSchedule(...args);
  }
}

export class ScheduleFacade {
  static getMobileJwSemesterSchedule(userId: number) {
    return mobileJwSemesterApplication.getSemesterSchedule(userId);
  }

  static getSchedule(...args: Parameters<ScheduleFacadeApplicationService['getSchedule']>) {
    return scheduleFacadeApplication.getSchedule(...args);
  }

  static getMobileJwSchedule(...args: Parameters<ScheduleFacadeApplicationService['getMobileJwSchedule']>) {
    return scheduleFacadeApplication.getMobileJwSchedule(...args);
  }

  static getJwFirstSchedule(...args: Parameters<ScheduleFacadeApplicationService['getJwFirstSchedule']>) {
    return scheduleFacadeApplication.getJwFirstSchedule(...args);
  }

  static getPortalFirstSchedule(...args: Parameters<ScheduleFacadeApplicationService['getPortalFirstSchedule']>) {
    return scheduleFacadeApplication.getPortalFirstSchedule(...args);
  }
}

export class ScheduleSourcePolicy {
  static status(...args: Parameters<ScheduleSourcePolicyApplicationService['status']>) {
    return scheduleSourcePolicyApplicationService.status(...args);
  }

  static configure(...args: Parameters<ScheduleSourcePolicyApplicationService['configure']>) {
    return scheduleSourcePolicyApplicationService.configure(...args);
  }
}

export type { ScheduleFacadeResult, ScheduleRequestMeta } from './domain/schedule';
export type { PreferredScheduleSource, ScheduleSourceMode, ScheduleSourcePolicySnapshot } from './domain/schedule-source-policy';
export { isPreferredScheduleSource, isScheduleSourceMode } from './domain/schedule-source-policy';
