/**
 * [INPUT]: 依赖 cheerio、成绩 DTO、SESSION_EXPIRED_INDICATORS、共享 JW 登录页判定、Logger 与 AppError/ErrorCode
 * [OUTPUT]: 对外提供 GradeParser，解析 JW 成绩 HTML 为 IGradeList
 * [POS]: campus-integrations/jw/parsers 的成绩纯解析器，识别 session 过期与评教未完成阻断
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import * as cheerio from 'cheerio';
import type { IGradeItem, IGradeList } from '../../../../types';
import { Logger } from '../../../../utils/logger';
import { SESSION_EXPIRED_INDICATORS } from '../../../../config';
import { AppError, ErrorCode } from '../../../../utils/errors';
import { looksLikeJwLoginPage } from './session-page';

const EVALUATION_REQUIRED_RE = /评教未完成，?不能查询成绩/;
const FAILED_GRADE_WORDS = ['不及格', '不合格', '未通过', '不通过', '重修', '挂'];
const PASSED_GRADE_WORDS = ['及格', '合格', '中', '良', '优', '通过'];

export const GradeParser = {
  parse(html: string, user?: { studentId?: string; name?: string }): IGradeList | null {
    // Only check the beginning of HTML for expiry indicators (avoid false positives from nav links)
    const htmlStart = (html || '').substring(0, 500);
    const isExpired = !html || html.length < 200 ||
      SESSION_EXPIRED_INDICATORS.some(i => htmlStart.includes(i)) ||
      looksLikeJwLoginPage(html);

    if (isExpired) {
      Logger.warn('GradeParser', 'Session 过期', `HTML长度: ${html?.length || 0}`);
      throw new Error("SESSION_EXPIRED");
    }

    if (EVALUATION_REQUIRED_RE.test(html)) {
      Logger.warn('GradeParser', '评教未完成，不能查询成绩', undefined, user?.studentId, user?.name);
      throw new AppError(ErrorCode.EVALUATION_REQUIRED, '评教未完成，不能查询成绩', {
        evaluationRequired: true,
      });
    }

    const $ = cheerio.load(html);
    if (!$('#dataList').length) {
      throw new Error('GRADE_PAGE_INVALID');
    }
    const items: IGradeItem[] = [];
    const normalize = (val: string) => val.replace(/\s+/g, ' ').trim();
    const toNumber = (val: string) => {
      const num = parseFloat(val);
      return Number.isFinite(num) ? num : null;
    };

    $('#dataList tr').slice(1).each((_, row) => {
      const cells = $(row).find('td');
      if (cells.length < 10) return;
      const text = (idx: number) => normalize($(cells[idx]).text());
      const scoreText = text(5);
      const score = toNumber(scoreText);
      const pass = GradeParser.detectPass(score, scoreText);

      const item: IGradeItem = {
        term: text(1),
        courseCode: text(2),
        courseName: text(3),
        groupName: text(4),
        score,
        scoreText,
        pass,
        passStatus: GradeParser.toPassStatus(pass),
        flag: text(6),
        credit: toNumber(text(7)),
        totalHours: toNumber(text(8)),
        gpa: toNumber(text(9)),
        retakeTerm: text(10),
        examMethod: text(11),
        examNature: text(12),
        courseAttribute: text(13),
        courseNature: text(14),
        courseCategory: text(15)
      };
      if (item.courseCode || item.courseName) items.push(item);
    });

    const summaryText = $('body').text().replace(/\s+/g, ' ');
    const match = summaryText.match(/所修门数[:：]\s*([\d.]+).*?所修总学分[:：]\s*([\d.]+).*?平均学分绩点[:：]\s*([\d.]+).*?平均成绩[:：]\s*([\d.]+)/);

    Logger.parser('GradeParser', `解析完成 ${items.length} 条成绩`, user?.studentId, user?.name);

    return {
      summary: {
        totalCourses: toNumber(match?.[1] || ''),
        totalCredits: toNumber(match?.[2] || ''),
        averageGpa: toNumber(match?.[3] || ''),
        averageScore: toNumber(match?.[4] || '')
      },
      items
    };
  },

  detectPass(score: number | null, text: string): boolean | null {
    const normalizedText = text.trim();
    if (normalizedText && FAILED_GRADE_WORDS.some(k => normalizedText.includes(k))) return false;
    if (normalizedText && PASSED_GRADE_WORDS.some(k => normalizedText.includes(k))) return true;
    if (score !== null) return score >= 60;
    return null;
  },

  toPassStatus(pass: boolean | null) {
    if (pass === true) return 'passed';
    if (pass === false) return 'failed';
    return 'unknown';
  }
};
