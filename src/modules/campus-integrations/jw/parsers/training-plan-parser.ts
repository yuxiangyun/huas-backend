/**
 * [INPUT]: 依赖 cheerio、JW 会话页判定与 Academic 的培养方案纯数据契约
 * [OUTPUT]: 对外提供两张 JW HTML 表的结构化解析，不把页面、脚本或会话凭证交给业务层
 * [POS]: JW 协议防腐层，严格识别课程行、课程体系合并单元格及执行计划的独立考核字段
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import * as cheerio from 'cheerio';
import type {
  TrainingPlanCourse, TrainingPlanExecution, TrainingPlanGroup, TrainingPlanHours,
  TrainingPlanSource,
} from '../../../academic/domain/training-plan';
import { looksLikeJwLoginPage } from './session-page';

const normalize = (value: string) => value.replace(/\s+/g, ' ').trim();
const nullable = (value: string) => value || null;
const number = (value: string): number | null => value !== '' && /^-?\d+(?:\.\d+)?$/.test(value) ? Number(value) : null;
const emptyHours = (): TrainingPlanHours => ({ theory: null, practice: null, computer: null, extracurricular: null, total: null });
const MAX_PLAN_SEMESTER_INDEX = 20;

function requirePage(html: string, tableId: string, headers: string[]) {
  if (!html || looksLikeJwLoginPage(html)) throw new Error('SESSION_EXPIRED');
  const $ = cheerio.load(html);
  const table = $(`#${tableId}`);
  if (!table.length || !headers.every(header => table.find('th').toArray().some(th => normalize($(th).text()) === header))) {
    throw new Error('TRAINING_PLAN_PAGE_INVALID');
  }
  return $;
}

function completion(raw: string): TrainingPlanCourse['completion'] {
  if (!raw) return { raw, status: 'unrecorded', scoreText: null, score: null };
  if (raw === '已修不及格') return { raw, status: 'failed', scoreText: null, score: null };
  const match = /^已修\((.*)\)$/.exec(raw);
  if (match) {
    const scoreText = normalize(match[1]);
    return { raw, status: 'completed', scoreText: nullable(scoreText), score: number(scoreText) };
  }
  return { raw, status: 'unknown', scoreText: null, score: null };
}

function semesterIndexes(raw: string): number[] {
  const values = raw.split(/[,，、]/).map(part => number(part.trim()));
  if (values.some(value => value !== null && Number.isInteger(value) && value > MAX_PLAN_SEMESTER_INDEX)) {
    throw new Error('TRAINING_PLAN_PAGE_INVALID');
  }
  return [...new Set(values.filter((value): value is number => value !== null && Number.isInteger(value) && value > 0))];
}

export const TrainingPlanParser = {
  parsePlan(html: string): TrainingPlanSource {
    const $ = requirePage(html, 'mxh', ['课程编号', '课程名称', '完成情况', '开设学期']);
    const title = normalize($('#dataList > caption').first().text());
    if (!title) throw new Error('TRAINING_PLAN_PAGE_INVALID');

    const groups: TrainingPlanGroup[] = [];
    const courses: TrainingPlanCourse[] = [];
    let currentGroup: TrainingPlanGroup | null = null;
    let totalCredits: number | null = null;
    let totalHours = emptyHours();

    $('#mxh > tbody > tr').each((_, row) => {
      const cells = $(row).children('td').toArray();
      const text = (index: number) => normalize($(cells[index]).text());
      if (cells.length === 8) {
        const label = text(0);
        const hours: TrainingPlanHours = {
          theory: number(text(2)), practice: number(text(3)), computer: number(text(4)),
          extracurricular: number(text(5)), total: number(text(6)),
        };
        if (label === '小计' && currentGroup) {
          currentGroup.subtotalCredits = number(text(1));
          currentGroup.subtotalHours = hours;
        } else if (label === '合计') {
          totalCredits = number(text(1));
          totalHours = hours;
        } else {
          throw new Error('TRAINING_PLAN_PAGE_INVALID');
        }
        return;
      }
      if (!cells.length) return;
      if (cells.length !== 13 && cells.length !== 14) throw new Error('TRAINING_PLAN_PAGE_INVALID');
      const offset = cells.length === 14 ? 1 : 0;
      if (offset) {
        const raw = text(0);
        const match = /^(.*?)\s*\(应修\s*([^/]*)\s*\/\s*已修\s*([^)]*)\)$/.exec(raw);
        currentGroup = {
          name: match ? normalize(match[1]) : raw, raw,
          requiredCredits: match ? number(normalize(match[2])) : null,
          requiredCreditsText: match ? normalize(match[2]) : null,
          earnedCredits: match ? number(normalize(match[3])) : null,
          earnedCreditsText: match ? normalize(match[3]) : null,
          subtotalCredits: null, subtotalHours: emptyHours(), courseCount: 0,
        };
        groups.push(currentGroup);
      }
      if (!currentGroup) throw new Error('TRAINING_PLAN_PAGE_INVALID');
      const courseCode = text(offset + 1);
      const courseName = text(offset + 2);
      if (!courseCode || !courseName) throw new Error('TRAINING_PLAN_PAGE_INVALID');
      const plannedSemesterText = text(offset + 12);
      courses.push({
        courseCode, courseName, curriculumGroup: currentGroup.name,
        selectionGroup: nullable(text(offset)),
        completion: completion(text(offset + 3)),
        courseNature: nullable(text(offset + 4)), courseAttribute: nullable(text(offset + 5)),
        credits: number(text(offset + 6)), creditsText: text(offset + 6),
        hours: {
          theory: number(text(offset + 7)), practice: number(text(offset + 8)),
          computer: number(text(offset + 9)), extracurricular: number(text(offset + 10)),
          total: number(text(offset + 11)),
        },
        plannedSemesterText, plannedSemesterIndexes: semesterIndexes(plannedSemesterText),
      });
      currentGroup.courseCount += 1;
    });

    if (!courses.length || !groups.length) throw new Error('TRAINING_PLAN_PAGE_INVALID');
    const prose = $('#dataList span[id="pymb"]');
    const objectives = normalize(prose.first().text());
    const description = normalize(prose.eq(1).text());
    return {
      title, version: /^\d{4}版/.exec(title)?.[0] ?? null,
      objectives: nullable(objectives), description: nullable(description),
      groups, courses, totalCredits, totalHours,
    };
  },

  parseExecution(html: string): TrainingPlanExecution[] {
    const $ = requirePage(html, 'dataList', ['开课学期', '课程编号', '课程名称', '考核方式', '是否考试']);
    const records: TrainingPlanExecution[] = [];
    $('#dataList > tbody > tr').slice(1).each((_, row) => {
      const cells = $(row).children('td').toArray();
      if (!cells.length) return;
      if (cells.length !== 11) throw new Error('TRAINING_PLAN_PAGE_INVALID');
      const text = (index: number) => normalize($(cells[index]).text());
      const courseCode = text(2);
      const courseName = text(3);
      if (!courseCode || !courseName) throw new Error('TRAINING_PLAN_PAGE_INVALID');
      records.push({
        sequence: number(text(0)), term: text(1), courseCode, courseName,
        teachingUnit: nullable(text(4)), credits: number(text(5)), creditsText: text(5),
        totalHours: number(text(6)), assessmentMethod: nullable(text(7)),
        courseNature: nullable(text(8)), courseAttribute: nullable(text(9)), isExamText: nullable(text(10)),
      });
    });
    return records;
  },
};
