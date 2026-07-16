import { describe, expect, it } from 'bun:test';
import { ScheduleParser } from '../src/parsers/academic/schedule-parser';

const VALID_SCHEDULE_HTML = `
<form target="hideFrame" method="post" name="Form1" id="Form1" action="">
  <table class="table table-bordered table-hover table-striped kb_table" style="overflow: scroll;height: 95%;">
    <thead>
      <tr>
        <th style="width: 14%;">周/节次</th>
        <th style="width: 12%;">星期一</th>
        <th style="width: 12%;">星期二</th>
        <th style="width: 12%;">星期三</th>
        <th style="width: 12%;">星期四</th>
        <th style="width: 12%;">星期五</th>
        <th style="width: 12%;">星期六</th>
        <th style="width: 12%;">星期日</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>第一大节<br/>(01,02小节)<br/>08:00-09:40</td>
        <td>
          <p title='课程学分：3.5<br/>课程属性：必修<br/>课程名称：计算机网络<br/>上课时间：第5周 星期一 [01-02]节<br/>上课地点：第三教学楼A405'>计算机网络</p>
        </td>
        <td>
          <p title='课程学分：3.5<br/>课程属性：必修<br/>课程名称：计算机网络<br/>上课时间：第5周 星期二 [01-02]节<br/>上课地点：第三教学楼A405'>计算机网络</p>
        </td>
        <td></td>
        <td>
          <p title='课程学分：2.5<br/>课程属性：必修<br/>课程名称：Web 应用开发技术<br/>上课时间：第5周 星期四 [01-02]节<br/>上课地点：第三教学楼A206'>Web 应用开发技术</p>
        </td>
        <td></td>
        <td></td>
        <td></td>
      </tr>
      <tr>
        <td>第三大节<br/>(05,06小节)<br/>14:30-16:10</td>
        <td>
          <p title='课程学分：1<br/>课程属性：必修<br/>课程名称：大学体育与健康（四）<br/>上课时间：第5周 星期一 [05-06]节<br/>上课地点：'>大学体育与健康（四）</p>
        </td>
        <td></td>
        <td></td>
        <td></td>
        <td></td>
        <td></td>
        <td></td>
      </tr>
    </tbody>
  </table>
</form>
<script type="text/javascript">
$("#li_showWeek").html("<span class=\\"main_text main_color\\">第5周</span>/19周");
</script>
`;

const OUT_OF_CALENDAR_HTML = `
<form target="hideFrame" method="post" name="Form1" id="Form1" action="">
  <table class="table table-bordered table-hover table-striped kb_table" style="overflow: scroll;height: 95%;">
    <thead>
      <tr>
        <th style="width: 14%;">周/节次</th>
        <th style="width: 12%;">星期一</th>
      </tr>
    </thead>
    <tbody></tbody>
  </table>
</form>
<script type="text/javascript">
$("#li_showWeek").html("当前登录已失效，请重新登录！");
$("#li_showWeek").html("<span class=\\"main_text main_color\\">当前日期不在教学周历内</span>");
</script>
`;

const OUT_OF_CALENDAR_SINGLE_QUOTE_HTML = `
<form target="hideFrame" method="post" name="Form1" id="Form1" action="">
  <table class="table table-bordered table-hover table-striped kb_table" style="overflow: scroll;height: 95%;">
    <thead>
      <tr>
        <th style="width: 14%;">周/节次</th>
        <th style="width: 12%;">星期一</th>
      </tr>
    </thead>
    <tbody></tbody>
  </table>
</form>
<script type="text/javascript">
$('#li_showWeek').html('当前登录已失效，请重新登录！');
$('#li_showWeek').html('<span class="main_text main_color">当前日期不在教学周历内</span>');
</script>
`;

const SESSION_EXPIRED_HTML = `
<script languge='javascript'>
window.location.href='https://cas.huas.edu.cn/cas/login?service=https%3A%2F%2Fxyjw.huas.edu.cn%2Fjsxsd%2Fframework%2Fmain_index_loadkb.jsp'
</script>
`;

const JW_LOGIN_PAGE_HTML = `
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <title>登录</title>
  </head>
  <body>
    <form action="/jsxsd/xk/LoginToXk" method="post">
      <h3>用户登录</h3>
      <input name="userAccount">
      <input name="RANDOMCODE" placeholder="验证码">
      <div>您的账号在其它地方登录</div>
    </form>
  </body>
</html>
`;

describe('ScheduleParser', () => {
  it('按真实 JW HTML 结构解析课程并输出前端可用 section', () => {
    const result = ScheduleParser.parse(VALID_SCHEDULE_HTML);

    expect(result.week).toBe('第5周');
    expect(result.message).toBe('');
    expect(result.courses).toHaveLength(4);
    expect(result.courses[0]).toEqual({
      name: '计算机网络',
      teacher: '',
      location: '第三教学楼A405',
      day: 1,
      section: '1-2',
      weekStr: '第5周 星期一 [01-02]节',
    });
    expect(result.courses[1]).toEqual({
      name: '计算机网络',
      teacher: '',
      location: '第三教学楼A405',
      day: 2,
      section: '1-2',
      weekStr: '第5周 星期二 [01-02]节',
    });
    expect(result.courses[2]).toEqual({
      name: 'Web 应用开发技术',
      teacher: '',
      location: '第三教学楼A206',
      day: 4,
      section: '1-2',
      weekStr: '第5周 星期四 [01-02]节',
    });
    expect(result.courses[3]).toEqual({
      name: '大学体育与健康（四）',
      teacher: '',
      location: '',
      day: 1,
      section: '5-6',
      weekStr: '第5周 星期一 [05-06]节',
    });
  });

  it('非教学周返回空课表消息，不误判为登录失效', () => {
    const result = ScheduleParser.parse(OUT_OF_CALENDAR_HTML);

    expect(result).toEqual({
      week: '暂无',
      courses: [],
      message: '当前日期不在教学周历内',
    });
  });

  it('li_showWeek 使用单引号时也能识别非教学周空态', () => {
    const result = ScheduleParser.parse(OUT_OF_CALENDAR_SINGLE_QUOTE_HTML);

    expect(result).toEqual({
      week: '暂无',
      courses: [],
      message: '当前日期不在教学周历内',
    });
  });

  it('CAS 重定向页仍判定为凭证失效', () => {
    expect(() => ScheduleParser.parse(SESSION_EXPIRED_HTML)).toThrow('SESSION_EXPIRED');
  });

  it('JW 返回登录页时判定为凭证失效而不是课表结构错误', () => {
    expect(() => ScheduleParser.parse(JW_LOGIN_PAGE_HTML)).toThrow('SESSION_EXPIRED');
  });

  it('div.kb_content 包裹嵌套 p 时只解析一次课程', () => {
    const html = VALID_SCHEDULE_HTML.replace(
      "<p title='课程学分：3.5<br/>课程属性：必修<br/>课程名称：计算机网络<br/>上课时间：第5周 星期一 [01-02]节<br/>上课地点：第三教学楼A405'>计算机网络</p>",
      "<div class='kb_content' title='课程名称：计算机网络<br/>上课时间：第5周 星期一 [01-02]节<br/>上课地点：第三教学楼A405'><p title='课程名称：计算机网络<br/>上课时间：第5周 星期一 [01-02]节'>计算机网络</p></div>",
    );
    const result = ScheduleParser.parse(html);

    expect(result.courses.filter((course) => course.day === 1 && course.name === '计算机网络')).toHaveLength(1);
  });
});
