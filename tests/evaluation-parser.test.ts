/**
 * [INPUT]: 依赖独立 EvaluationParser、EvaluationService、HttpClient 测试替身与教务评教 HTML 边界样本
 * [OUTPUT]: 验证入口发现、列表/表单解析、有界续批、重排安全回查与结果 DTO 口径
 * [POS]: tests 的评教业务回归套件，保护 HTML 适配与提交事实不可伪造
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { describe, expect, it } from 'bun:test';
import type { HttpClient } from '../src/core/http-client';
import { EvaluationParser } from '../src/parsers/academic/evaluation-parser';
import { EvaluationService } from '../src/services/academic/evaluation-service';

const LIST_URL = 'https://xyjw.huas.edu.cn/jsxsd/xspj/xspj_list.do?pj0502id=batch';

function evaluationListHtml(submitted: boolean) {
  const submittedText = submitted ? '是' : '否';
  const action = submitted
    ? '<a href="/jsxsd/xspj/xspj_edit.do?type=view">查看</a>'
    : '<a href="/jsxsd/xspj/xspj_edit.do?pj0502id=batch&jg0101id=2431">评价</a>';
  return `
    <table id="dataList">
      <tr><th>序号</th><th>教师编号</th><th>教师姓名</th><th>学院</th><th>类别</th><th>总评分</th><th>已评</th><th>是否提交</th><th>操作</th></tr>
      <tr>
        <td>1</td><td>2431</td><td>张华</td><td>文史学院</td><td>理论课</td><td>${submitted ? '100' : '0'}</td><td>${submittedText}</td><td>${submittedText}</td><td>${action}</td>
      </tr>
    </table>
  `;
}

const evaluationFormHtml = `
  <form id="Form1" action="/jsxsd/xspj/xspj_save.do" method="post">
    <input type="hidden" name="issubmit" value="0">
    <input type="text" name="sjfz_question_1" onchange="checkFz(this,'100')" value="">
    <textarea name="jynr"></textarea>
  </form>
`;

function makeEvaluationClient(options: { submitHtml: string; submittedAfterPost: boolean }) {
  let submitted = false;
  let postCount = 0;
  let listGetCount = 0;
  const client = {
    async request(url: string, request: RequestInit = {}) {
      if (url.includes('xspj_list.do')) {
        listGetCount += 1;
        return new Response(evaluationListHtml(submitted));
      }
      if (url.includes('xspj_edit.do')) return new Response(evaluationFormHtml);
      if (url.includes('xspj_save.do') && request.method === 'POST') {
        postCount += 1;
        submitted = options.submittedAfterPost;
        return new Response(options.submitHtml, { status: 200 });
      }
      throw new Error(`UNEXPECTED_REQUEST:${url}`);
    },
  } as HttpClient;

  return { client, getPostCount: () => postCount, getListGetCount: () => listGetCount };
}

function batchEvaluationListHtml(submitted: Set<string>) {
  const rows = ['2431', '2432', '2433'].map((teacherId, index) => {
    const done = submitted.has(teacherId);
    const action = done
      ? '<a href="/jsxsd/xspj/xspj_edit.do?type=view">查看</a>'
      : `<a href="/jsxsd/xspj/xspj_edit.do?jg0101id=${teacherId}">评价</a>`;
    return `<tr><td>${index + 1}</td><td>${teacherId}</td><td>教师${index + 1}</td><td>学院</td><td>理论课</td><td>${done ? 100 : 0}</td><td>${done ? '是' : '否'}</td><td>${done ? '是' : '否'}</td><td>${action}</td></tr>`;
  }).join('');
  return `<table id="dataList"><tr><th>序号</th></tr>${rows}</table>`;
}

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
    expect(rows[0].actionable).toBe(true);
    expect(rows[0].state).toBe('pending');
    expect(rows[1].pending).toBe(false);
    expect(rows[1].state).toBe('completed');
  });

  it('未提交但缺少编辑链接的任务标记为 blocked，而不是完成', () => {
    const rows = EvaluationParser.extractListRows(`
      <table id="dataList">
        <tr><th>序号</th></tr>
        <tr><td>1</td><td>2431</td><td>张华</td><td>文史学院</td><td>理论课</td><td>0</td><td>否</td><td>否</td><td>入口缺失</td></tr>
      </table>
    `);

    expect(rows[0]).toMatchObject({ pending: true, actionable: false, blocked: true, state: 'blocked' });
  });

  it('合法空列表可识别，但 HTTP 200 错误页不能伪装成空任务', () => {
    expect(EvaluationParser.extractListRows('<table id="dataList"><tr><th>序号</th></tr></table>')).toEqual([]);
    expect(() => EvaluationParser.extractListRows(`<html><body>${'系统错误'.repeat(80)}</body></html>`))
      .toThrow('EVALUATION_LIST_INVALID');
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

  it('HTTP 200 错误页不能被记为提交成功', async () => {
    const fake = makeEvaluationClient({
      submitHtml: '<html><body>系统异常：保存失败</body></html>',
      submittedAfterPost: false,
    });

    const result = await EvaluationService.submitFullScoreFromClient(fake.client, LIST_URL, {
      dryRun: false,
    });

    expect(fake.getPostCount()).toBe(1);
    expect(fake.getListGetCount()).toBe(2);
    expect(result.submittedCount).toBe(0);
    expect(result.failedCount).toBe(1);
    expect(result.items[0].status).toBe('failed');
    expect(result.items[0].message).toBe('EVALUATION_UPSTREAM_ERROR_PAGE');
    expect(result.status.pendingCount).toBe(1);
    expect(result.status.completedCount).toBe(0);
  });

  it('只有响应有效且回查列表已提交才计入本次 submittedCount', async () => {
    const fake = makeEvaluationClient({
      submitHtml: '<html><body>提交成功</body></html>',
      submittedAfterPost: true,
    });

    const result = await EvaluationService.submitFullScoreFromClient(fake.client, LIST_URL, {
      dryRun: false,
      comment: '好',
    });

    expect(result.targetCount).toBe(1);
    expect(result.attemptedCount).toBe(1);
    expect(result.previewedCount).toBe(0);
    expect(result.submittedCount).toBe(1);
    expect(result.failedCount).toBe(0);
    expect(result.batch).toMatchObject({ selectedCount: 1, verificationRequests: 1, hasMore: false });
    expect(result.items[0].status).toBe('submitted');
    expect(result.status).toMatchObject({
      total: 1,
      pendingCount: 0,
      completedCount: 1,
    });
    expect((result as any).successCount).toBeUndefined();
  });

  it('批末列表重排时按稳定业务字段的已提交增量确认结果', async () => {
    let submitted = false;
    const client = {
      async request(url: string, request: RequestInit = {}) {
        if (url.includes('xspj_list.do')) {
          const html = evaluationListHtml(submitted);
          return new Response(submitted ? html.replace('<td>1</td>', '<td>9</td>') : html);
        }
        if (url.includes('xspj_edit.do')) return new Response(evaluationFormHtml);
        if (url.includes('xspj_save.do') && request.method === 'POST') {
          submitted = true;
          return new Response('<html><body>提交成功</body></html>');
        }
        throw new Error(`UNEXPECTED_REQUEST:${url}`);
      },
    } as HttpClient;

    const result = await EvaluationService.submitFullScoreFromClient(client, LIST_URL, { dryRun: false });

    expect(result.submittedCount).toBe(1);
    expect(result.items[0].status).toBe('submitted');
  });

  it('HTTP 200 普通页面但回查仍待提交时判定为未确认', async () => {
    const fake = makeEvaluationClient({
      submitHtml: '<html><body>请求已处理</body></html>',
      submittedAfterPost: false,
    });

    const result = await EvaluationService.submitFullScoreFromClient(fake.client, LIST_URL, {
      dryRun: false,
    });

    expect(result.submittedCount).toBe(0);
    expect(result.failedCount).toBe(1);
    expect(result.items[0].message).toBe('SUBMIT_NOT_CONFIRMED');
    expect(result.status.pendingCount).toBe(1);
  });

  it('列表/发现 HTTP 5xx 直接失败，不返回 0 任务', async () => {
    const client = {
      request: async () => new Response('<html><body>错误页</body></html>', { status: 503 }),
    } as unknown as HttpClient;

    await expect(EvaluationService.submitFullScoreFromClient(client, LIST_URL)).rejects.toThrow('EVALUATION_LIST_HTTP_503');
    await expect(EvaluationService.discoverListUrlFromClient(client)).rejects.toThrow('EVALUATION_DISCOVERY_HTTP_503');
  });

  it('表单读取 SESSION_EXPIRED 不会被逐项 failed 吞掉', async () => {
    const client = {
      async request(url: string) {
        if (url.includes('xspj_list.do')) return new Response(evaluationListHtml(false));
        return new Response('<html><body>用户登录</body></html>');
      },
    } as unknown as HttpClient;

    await expect(EvaluationService.submitFullScoreFromClient(client, LIST_URL, { dryRun: false }))
      .rejects.toThrow('SESSION_EXPIRED');
  });

  it('默认批次最多处理两项且只做一次最终列表回查', async () => {
    const submitted = new Set<string>();
    let listReads = 0;
    let posts = 0;
    const client = {
      async request(url: string, request: RequestInit = {}) {
        if (url.includes('xspj_list.do')) {
          listReads += 1;
          return new Response(batchEvaluationListHtml(submitted));
        }
        if (url.includes('xspj_edit.do')) {
          const teacherId = new URL(url).searchParams.get('jg0101id');
          return new Response(evaluationFormHtml.replace('/jsxsd/xspj/xspj_save.do', `/jsxsd/xspj/xspj_save.do?teacherId=${teacherId}`));
        }
        if (url.includes('xspj_save.do') && request.method === 'POST') {
          posts += 1;
          submitted.add(new URL(url).searchParams.get('teacherId') || '');
          return new Response('<html><body>提交成功</body></html>');
        }
        throw new Error(`UNEXPECTED_REQUEST:${url}`);
      },
    } as unknown as HttpClient;

    const result = await EvaluationService.submitFullScoreFromClient(client, LIST_URL, { dryRun: false });

    expect(posts).toBe(2);
    expect(listReads).toBe(2);
    expect(result.submittedCount).toBe(2);
    expect(result.status.actionableCount).toBe(1);
    expect(result.batch).toEqual({
      limit: 2,
      availableCount: 3,
      selectedCount: 2,
      remainingCount: 1,
      hasMore: true,
      verificationRequests: 1,
    });

    const next = await EvaluationService.submitFullScoreFromClient(client, LIST_URL, { dryRun: false });
    expect(next.submittedCount).toBe(1);
    expect(next.batch).toEqual({
      limit: 2,
      availableCount: 1,
      selectedCount: 1,
      remainingCount: 0,
      hasMore: false,
      verificationRequests: 1,
    });
    expect(posts).toBe(3);
    expect(listReads).toBe(4);
  });
});
