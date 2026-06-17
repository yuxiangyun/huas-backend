import { describe, expect, it } from 'bun:test';
import { ClassroomFreeParser } from '../src/parsers/academic/classroom-free-parser';
import { ClassroomFreeService } from '../src/services/academic/classroom-free-service';
import { AppError, ErrorCode } from '../src/utils/errors';

describe('ClassroomFreeParser', () => {
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
