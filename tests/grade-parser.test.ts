/**
 * [INPUT]: 依赖 GradeParser、成绩 HTML 结构与 AppError/ErrorCode
 * [OUTPUT]: 验证成绩状态、评教阻断、合法空表与错误页拒绝语义
 * [POS]: tests 的 JW 成绩页面边界回归套件，防止错误页被缓存为业务空态
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { describe, expect, it } from 'bun:test';
import { GradeParser } from '../src/parsers/academic/grade-parser';
import { AppError, ErrorCode } from '../src/utils/errors';

function buildGradeHtml(scoreText: string) {
  const cells = [
    '1', '2024-2025-1', 'TEST001', '大学体育', '默认组', scoreText,
    '', '1', '16', '', '', '考试', '正常', '必修', '公共课', '体育',
  ];

  return `
    <html><body>
      ${'x'.repeat(220)}
      <table id="dataList">
        <tr><th>序号</th></tr>
        <tr>${cells.map((cell) => `<td>${cell}</td>`).join('')}</tr>
      </table>
    </body></html>
  `;
}

describe('GradeParser', () => {
  it('为非数字成绩输出 unknown passStatus，避免客户端误判挂科', () => {
    const parsed = GradeParser.parse(buildGradeHtml('缓考'));
    expect(parsed?.items[0].pass).toBeNull();
    expect(parsed?.items[0].passStatus).toBe('unknown');
  });

  it('先识别失败词，避免不及格类文本被及格/通过子串误判', () => {
    for (const scoreText of ['不及格', '不通过', '未通过']) {
      const parsed = GradeParser.parse(buildGradeHtml(scoreText));
      expect(parsed?.items[0].pass).toBe(false);
      expect(parsed?.items[0].passStatus).toBe('failed');
    }
  });

  it('检测评教未完成导致成绩不可查询', () => {
    const html = `
      <html>
        <body>
          <table id="dataList">
            <tr><th>序号</th><th>课程名称</th></tr>
            <tr><td colspan="16">未查询到数据</td></tr>
          </table>
          <script>
            function loadjs(){
              if('评教未完成，不能查询成绩！'!=''){
                alert('评教未完成，不能查询成绩！');
              }
            }
          </script>
        </body>
      </html>
    `;

    expect(() => GradeParser.parse(html)).toThrow(AppError);

    try {
      GradeParser.parse(html);
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe(ErrorCode.EVALUATION_REQUIRED);
      expect((error as AppError).data).toEqual({ evaluationRequired: true });
    }
  });

  it('合法空成绩表返回空数组，无 dataList 的错误页被拒绝', () => {
    const empty = GradeParser.parse(`<html><body>${'x'.repeat(220)}<table id="dataList"><tr><th>序号</th></tr></table></body></html>`);
    expect(empty?.items).toEqual([]);
    expect(() => GradeParser.parse(`<html><body>${'服务异常'.repeat(80)}</body></html>`))
      .toThrow('GRADE_PAGE_INVALID');
  });

  it('JW 登录表单位于页面后部时仍判定为会话失效', () => {
    const loginPage = `
      <html>
        <head><title>登录</title></head>
        <body>
          ${'x'.repeat(800)}
          <form id="Form1" action="/jsxsd/xk/LoginToXk" method="post">
            <input name="userAccount">
            <input name="RANDOMCODE">
          </form>
        </body>
      </html>
    `;

    expect(() => GradeParser.parse(loginPage)).toThrow('SESSION_EXPIRED');
  });
});
