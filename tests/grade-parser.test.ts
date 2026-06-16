import { describe, expect, it } from 'bun:test';
import { GradeParser } from '../src/parsers/academic/grade-parser';
import { AppError, ErrorCode } from '../src/utils/errors';

describe('GradeParser', () => {
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
});
