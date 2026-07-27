/**
 * [INPUT]: 依赖 modules/academic 的 canonical Classrooms composition
 * [OUTPUT]: 兼容再导出 ClassroomFreeService，保持旧导入路径、管理员学号 getter 与静态方法
 * [POS]: services/academic 的只读迁移 Facade，旧路由单向指向 Academic
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export { ClassroomFreeService } from '../../modules/academic/classroom';
