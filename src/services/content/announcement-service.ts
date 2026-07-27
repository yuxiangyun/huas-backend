/**
 * [INPUT]: 依赖 modules/operations/infrastructure 的 canonical 公告服务
 * [OUTPUT]: 继续导出 AnnouncementService、Announcement/AnnouncementType 旧类名/类型与路径
 * [POS]: services/content 的单向兼容 Facade；公告校验与原子文件持久化已迁入 Operations
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export { AnnouncementService } from '../../modules/operations/infrastructure/announcement-service';
export type { Announcement, AnnouncementType } from '../../modules/operations/infrastructure/announcement-service';
