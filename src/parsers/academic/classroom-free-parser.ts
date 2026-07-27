/**
 * [INPUT]: 依赖 campus-integrations/jw/parsers 的 canonical 空教室解析器
 * [OUTPUT]: 兼容再导出 ClassroomFreeParser、类型与 SPECIAL_CLASSROOM_RE
 * [POS]: parsers/academic 的只读迁移 Facade，保持旧 JW 空教室解析路径稳定
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export { ClassroomFreeParser, SPECIAL_CLASSROOM_RE } from '../../modules/campus-integrations/jw/parsers/classroom-free-parser';
export type { ClassroomBuilding, FreeClassroom } from '../../modules/campus-integrations/jw/parsers/classroom-free-parser';
