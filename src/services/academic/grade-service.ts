/**
 * [INPUT]: 依赖 modules/academic 的 canonical Grade composition
 * [OUTPUT]: 兼容再导出 GradeService，保持旧导入路径与静态方法签名
 * [POS]: services/academic 的只读迁移 Facade，旧路由单向指向 Academic
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export { GradeService } from '../../modules/academic/grade';
