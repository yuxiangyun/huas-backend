import { describe, expect, it } from 'bun:test';
import { EvaluationParser } from '../src/services/academic/evaluation-service';

describe('EvaluationParser', () => {
  it('从评教入口页脚本中发现当前批次列表 URL', () => {
    const listUrl = EvaluationParser.extractEvaluationListUrl(`
      <script>
        window.location.href = '/jsxsd/xspj/xspj_list.do?xnxq01id=2025-2026-2&amp;pj01id=pj&amp;pj0502id=batch';
      </script>
    `, 'https://xyjw.huas.edu.cn/jsxsd/xspj/xspj_find.do?dynamic=current');

    expect(listUrl).toBe('https://xyjw.huas.edu.cn/jsxsd/xspj/xspj_list.do?xnxq01id=2025-2026-2&pj01id=pj&pj0502id=batch');
  });

  it('从评教查询表单中构造列表 URL', () => {
    const listUrl = EvaluationParser.extractEvaluationListUrl(`
      <form action="/jsxsd/xspj/xspj_list.do" method="get">
        <input type="hidden" name="pj0502id" value="batch">
        <input type="hidden" name="pj01id" value="pj">
        <select name="xnxq01id">
          <option value="2024-2025-2">旧学期</option>
          <option value="2025-2026-2" selected>当前学期</option>
        </select>
      </form>
    `, 'https://xyjw.huas.edu.cn/jsxsd/xspj/xspj_find.do');

    expect(listUrl).toBe('https://xyjw.huas.edu.cn/jsxsd/xspj/xspj_list.do?pj0502id=batch&pj01id=pj&xnxq01id=2025-2026-2');
  });

  it('从教务首页菜单中发现评教入口 URL', () => {
    const entryUrls = EvaluationParser.extractEvaluationEntryUrls(`
      <a onclick="openMenu('/jsxsd/xspj/xspj_find.do?dynamic=current')">学生评教</a>
      <a href="/jsxsd/kscj/cjcx_query">成绩查询</a>
    `, 'https://xyjw.huas.edu.cn/jsxsd/framework/xsMain.jsp');

    expect(entryUrls).toEqual([
      'https://xyjw.huas.edu.cn/jsxsd/xspj/xspj_find.do?dynamic=current',
    ]);
  });

  it('从教务首页 data-url 菜单中拼出真实点击使用的评教入口', () => {
    const entryUrls = EvaluationParser.extractEvaluationEntryUrls(`
      <li data-sjcode="MENU_DYNAMIC_XSPJ" data-url="/xspj/xspj_find.do">
        <a href="javascript:void(0)">学生评价</a>
      </li>
    `, 'https://xyjw.huas.edu.cn/jsxsd/framework/xsMain.jsp');

    expect(entryUrls).toEqual([
      'https://xyjw.huas.edu.cn/jsxsd/xspj/xspj_find.do',
    ]);
  });

  it('从教务框架页发现后续导航页', () => {
    const navUrls = EvaluationParser.extractJwNavigationUrls(`
      <iframe src="/jsxsd/framework/left.jsp"></iframe>
      <script src="/jsxsd/js/common.js"></script>
      <a href="https://example.com/outside.jsp">外站</a>
    `, 'https://xyjw.huas.edu.cn/jsxsd/framework/xsMain.jsp');

    expect(navUrls).toEqual([
      'https://xyjw.huas.edu.cn/jsxsd/framework/left.jsp',
    ]);
  });

  it('解析评教列表中的待评老师', () => {
    const rows = EvaluationParser.extractListRows(`
      <table id="dataList">
        <tr><th>序号</th><th>教师编号</th><th>教师姓名</th><th>所属学院</th><th>评教类别</th><th>总评分</th><th>已评</th><th>是否提交</th><th>操作</th></tr>
        <tr>
          <td>1</td><td>2431</td><td>张华</td><td>文史与法学学院</td><td>理论课</td><td>0</td><td>否</td><td>否</td>
          <td><a href="/jsxsd/xspj/xspj_edit.do?xnxq01id=2025-2026-2&pj01id=pj&pj0502id=batch&jg0101id=2431">评价</a></td>
        </tr>
        <tr>
          <td>2</td><td>2617</td><td>何青</td><td>计算机与电气工程学院</td><td>理论课</td><td>100</td><td>是</td><td>是</td>
          <td><a href="/jsxsd/xspj/xspj_edit.do?type=view">查看</a></td>
        </tr>
      </table>
    `);

    expect(rows).toHaveLength(2);
    expect(rows[0].teacherName).toBe('张华');
    expect(rows[0].pending).toBe(true);
    expect(rows[1].pending).toBe(false);
  });

  it('按每项最高分构造满分提交表单，并补齐学生评价内容', () => {
    const form = EvaluationParser.buildFullScoreForm(`
      <form id="Form1" action="/jsxsd/xspj/xspj_save.do" method="post">
        <input type="hidden" name="issubmit" value="0">
        <input type="hidden" name="sfxyt" value="0">
        <input type="hidden" name="pj09id" value="pj09">
        <input type="hidden" name="pj06xh" value="9_abc">
        <table>
          <tr>
            <td>为人师表<input type="hidden" name="pj06xh" value="10_def"></td>
            <td>10</td>
            <td><input type="text" name="sjfz_9_abc" onchange="checkFz(this,'10')" value=""></td>
          </tr>
          <tr>
            <td>课堂管理</td>
            <td>5</td>
            <td><input type="text" name="sjfz_10_def" value=""></td>
          </tr>
        </table>
        <textarea name="jynr"></textarea>
      </form>
    `, 'https://xyjw.huas.edu.cn/jsxsd/xspj/xspj_edit.do?x=1', '好');

    expect(form.actionUrl).toBe('https://xyjw.huas.edu.cn/jsxsd/xspj/xspj_save.do');
    expect(form.questionCount).toBe(2);
    expect(form.fullScore).toBe(15);
    expect(form.body.get('issubmit')).toBe('1');
    expect(form.body.get('sfxyt')).toBe('0');
    expect(form.body.get('sjfz_9_abc')).toBe('10');
    expect(form.body.get('sjfz_10_def')).toBe('5');
    expect(form.body.get('jynr')).toBe('好');
    expect(form.body.getAll('pj06xh')).toEqual(['9_abc', '10_def']);
  });

  it('单选型评教按每组最高分选项提交', () => {
    const form = EvaluationParser.buildFullScoreForm(`
      <form id="Form1" action="/jsxsd/xspj/xspj_save.do" method="post">
        <input type="hidden" name="issubmit" value="0">
        <input type="hidden" name="pj06xh" value="radio_1">
        <label><input type="radio" name="pj0601id_radio_1" value="low"><input type="hidden" value="6">一般</label>
        <label><input type="radio" name="pj0601id_radio_1" value="high"><input type="hidden" value="10">优秀</label>
        <input type="hidden" name="pj06xh" value="radio_2">
        <label><input type="radio" name="pj0601id_radio_2" value="good" data-score="5">好</label>
        <label><input type="radio" name="pj0601id_radio_2" value="better" data-score="8">很好</label>
        <textarea name="jynr"></textarea>
      </form>
    `, 'https://xyjw.huas.edu.cn/jsxsd/xspj/xspj_edit.do?x=1', '好');

    expect(form.questionCount).toBe(2);
    expect(form.fullScore).toBe(18);
    expect(form.body.get('pj0601id_radio_1')).toBe('high');
    expect(form.body.get('pj0601id_radio_2')).toBe('better');
    expect(form.body.get('jynr')).toBe('好');
  });
});
