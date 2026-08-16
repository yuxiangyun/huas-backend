/**
 * [INPUT]: 依赖空教室 canonical 解析器/服务、统一 AppError/ErrorCode 与可控 JW 页面样本
 * [OUTPUT]: 验证会话失效、上游错误页、目标结构空态、楼栋/教室过滤与服务错误映射
 * [POS]: tests 的空教室协议回归，保护不稳定 JW HTML/JSON 到稳定业务结果的解析边界
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { describe, expect, it } from 'bun:test';
import { ClassroomFreeParser } from '../src/parsers/academic/classroom-free-parser';
import { ClassroomFreeService } from '../src/services/academic/classroom-free-service';
import { AppError, ErrorCode } from '../src/utils/errors';

describe('ClassroomFreeParser', () => {
  it('登录表单位于页面后部时所有解析入口都触发会话恢复', () => {
    const loginPage = `
      <html><head><title>登录</title></head><body>
        ${'x'.repeat(900)}
        <form action="/jsxsd/xk/LoginToXk"><input name="RANDOMCODE" placeholder="验证码"></form>
      </body></html>
    `;

    expect(() => ClassroomFreeParser.parseCurrentTerm(loginPage)).toThrow('SESSION_EXPIRED');
    expect(() => ClassroomFreeParser.parseCurrentWeek(loginPage)).toThrow('SESSION_EXPIRED');
    expect(() => ClassroomFreeParser.parseBuildings(loginPage, 'A')).toThrow('SESSION_EXPIRED');
    expect(() => ClassroomFreeParser.parseFreeRooms(loginPage)).toThrow('SESSION_EXPIRED');
  });

  it('HTTP 200 通用错误页和未知结构不能伪装成空楼栋或空教室', () => {
    for (const errorPage of [
      '<html><body>Whitelabel Error Page</body></html>',
      '<html><body>系统异常，服务暂不可用</body></html>',
    ]) {
      expect(() => ClassroomFreeParser.parseBuildings(errorPage, 'A')).toThrow('CLASSROOM_UPSTREAM_ERROR_PAGE');
      expect(() => ClassroomFreeParser.parseFreeRooms(errorPage)).toThrow('CLASSROOM_UPSTREAM_ERROR_PAGE');
    }

    expect(() => ClassroomFreeParser.parseBuildings('<html><body>未知页面</body></html>', 'A'))
      .toThrow('CLASSROOM_BUILDINGS_PAGE_INVALID');
    expect(() => ClassroomFreeParser.parseFreeRooms('<html><body>未知页面</body></html>'))
      .toThrow('CLASSROOM_FREE_PAGE_INVALID');
  });

  it('只有可识别目标结构才能表达合法空数据', () => {
    expect(ClassroomFreeParser.parseBuildings('[]', 'A')).toEqual([]);
    expect(ClassroomFreeParser.parseBuildings('<select><option value="-1">请选择</option></select>', 'A')).toEqual([]);
    expect(ClassroomFreeParser.parseFreeRooms('<table id="dataList"><tr><th>教室</th></tr></table>')).toEqual([]);
  });

  it('解析空教室并只匹配末尾容量括号', () => {
    const rooms = ClassroomFreeParser.parseFreeRooms(`
      <table id="dataList">
        <tr jsbh="A13A105">
          <td><input type="checkbox" value="A13A105" name="jsids"> 第三教学楼A105(130/30)</td>
        </tr>
        <tr jsbh="PD804">
          <td><input type="checkbox" value="PD804" name="jsids"> P-D804(1)(40/0)</td>
        </tr>
      </table>
    `);

    expect(rooms).toEqual([
      { id: 'A13A105', name: '第三教学楼A105', capacity: 130, examCapacity: 30 },
      { id: 'PD804', name: 'P-D804(1)', capacity: 40, examCapacity: 0 },
    ]);
  });

  it('过滤特殊楼栋和特殊教室', () => {
    const buildings = ClassroomFreeParser.parseBuildings(JSON.stringify([
      { DM: 'A13', MC: '第三教学楼A座' },
      { DM: 'A99', MC: '艺术楼A座' },
      { DM: 'B02', MC: '体育楼A座' },
      { DM: 'A12', MC: '西院物理实验楼' },
      { DM: 'B03', MC: '东院第一实验楼' },
    ]), 'A');

    const rooms = ClassroomFreeParser.parseFreeRooms(`
      <table id="dataList">
        <tr jsbh="A13A105"><td>第三教学楼A105(130/30)</td></tr>
        <tr jsbh="GYM01"><td>体育馆101(60/0)</td></tr>
      </table>
    `);

    expect(buildings.map((item) => item.buildingId)).toEqual(['A13', 'A12', 'B03']);
    expect(rooms.map((item) => item.id)).toEqual(['A13A105']);
  });

  it('解析当前学期和当前周', () => {
    const queryPage = `
      <select name="xnxqh">
        <option value="2024-2025-2">旧学期</option>
        <option value="2025-2026-2" selected>当前学期</option>
      </select>
    `;
    const mainPage = `
      <script>
        $("#li_showWeek").html("<span class=\\"main_text main_color\\">第16周</span>/20周");
      </script>
    `;

    expect(ClassroomFreeParser.parseCurrentTerm(queryPage)).toBe('2025-2026-2');
    expect(ClassroomFreeParser.parseCurrentWeek(mainPage)).toBe(16);
  });
});

describe('ClassroomFreeService validation', () => {
  it('严格校验 API 参数', async () => {
    await expect(ClassroomFreeService.getBuildings('C')).rejects.toMatchObject({
      code: ErrorCode.PARAM_ERROR,
    });

    const actor = { userId: 1, studentId: '2023001001', name: '测试用户' };

    await expect(ClassroomFreeService.getFreeRooms({
      campusId: 'A',
      buildingId: 'A13',
      week: '16',
      startSection: '1',
      endSection: '2',
    }, actor)).rejects.toMatchObject({
      code: ErrorCode.PARAM_ERROR,
    });

    await expect(ClassroomFreeService.getFreeRooms({
      campusId: 'A',
      buildingId: 'A13',
      startSection: '3',
      endSection: '2',
    }, actor)).rejects.toBeInstanceOf(AppError);
  });
});
