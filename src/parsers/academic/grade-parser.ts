/**
 * [INPUT]: 依赖 campus-integrations/jw/parsers 的 canonical 成绩解析器
 * [OUTPUT]: 兼容再导出 GradeParser
 * [POS]: parsers/academic 的只读迁移 Facade，保持旧 JW 成绩解析路径稳定
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

export { GradeParser } from '../../modules/campus-integrations/jw/parsers/grade-parser';
