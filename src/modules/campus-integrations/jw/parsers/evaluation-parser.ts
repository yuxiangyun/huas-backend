/**
 * [INPUT]: 依赖 cheerio、教务 URL 配置与统一 AppError/ErrorCode
 * [OUTPUT]: 对外提供 EvaluationParser、评教列表/表单类型及 URL、会话、提交页解析规则
 * [POS]: campus-integrations/jw/parsers 的评教纯解析核心，把不稳定教务 HTML 转换为稳定任务与满分表单
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import * as cheerio from 'cheerio';
import { URLS } from '../../endpoints';
import { AppError, ErrorCode } from '../../../../utils/errors';

export interface EvaluationListItem {
  index: string;
  teacherId: string;
  teacherName: string;
  college: string;
  category: string;
  totalScore: string;
  evaluated: string;
  submitted: string;
  pending: boolean;
  actionable: boolean;
  blocked: boolean;
  state: 'pending' | 'completed' | 'blocked';
}

export interface EvaluationListRow extends EvaluationListItem {
  editUrl: string;
}

export interface EvaluationForm {
  actionUrl: string;
  body: URLSearchParams;
  questionCount: number;
  fullScore: number;
}

const MAX_LIST_URL_LENGTH = 500;
const SCORE_INPUT_PREFIX = 'sjfz_';
const SCORE_RADIO_PREFIX = 'pj0601id_';
export const EVALUATION_LIST_PATH = '/jsxsd/xspj/xspj_list.do';
const EVALUATION_ENTRY_PATH = '/jsxsd/xspj/xspj_find.do';

export function normalizeEvaluationText(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function stripHtmlComments(html: string) {
  return html.replace(/<!--[\s\S]*?-->/g, '');
}

export function assertJwEvaluationListUrl(rawUrl: string) {
  const value = rawUrl.trim();
  if (!value || value.length > MAX_LIST_URL_LENGTH) {
    throw new AppError(ErrorCode.PARAM_ERROR, '评教列表 URL 无效');
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new AppError(ErrorCode.PARAM_ERROR, '评教列表 URL 无效');
  }

  if (url.origin !== URLS.jwBase || url.pathname !== EVALUATION_LIST_PATH) {
    throw new AppError(ErrorCode.PARAM_ERROR, '只支持教务系统评教列表 URL');
  }

  return url.toString();
}

export function safeJwUrl(rawUrl: string, baseUrl: string) {
  const value = rawUrl.trim().replace(/&amp;/g, '&');
  if (!value || /^javascript:/i.test(value) || /^#/i.test(value)) return null;

  try {
    const normalized = value.startsWith('jsxsd/') ? `/${value}` : value;
    const url = new URL(normalized, baseUrl);
    if (url.origin !== URLS.jwBase) return null;
    return url.toString();
  } catch {
    return null;
  }
}

function safeJwMenuUrl(rawUrl: string, baseUrl: string) {
  const value = rawUrl.trim().replace(/&amp;/g, '&');
  if (!value) return null;

  const normalized = value.startsWith('/jsxsd/')
    ? value
    : value.startsWith('/')
      ? `/jsxsd${value}`
      : value;
  return safeJwUrl(normalized, baseUrl);
}

function addListUrlCandidate(candidates: Set<string>, rawUrl: string, baseUrl: string) {
  // 首页菜单在不同 JW 页面版本中同时出现 /xspj/... 与 /jsxsd/xspj/...；
  // 后者才是实际可访问的评教路由，统一在边界层归一化。
  const url = safeJwMenuUrl(rawUrl, baseUrl) || safeJwUrl(rawUrl, baseUrl);
  if (!url) return;

  try {
    candidates.add(assertJwEvaluationListUrl(url));
  } catch {
    // 扫描上游 HTML 时忽略非列表链接与畸形候选。
  }
}

function appendListUrlsFromText(candidates: Set<string>, text: string, baseUrl: string) {
  const decoded = text.replace(/&amp;/g, '&');
  const listUrlRe = /(?:(?:https?:)?\/\/xyjw\.huas\.edu\.cn)?\/?(?:jsxsd\/)?xspj\/xspj_list\.do(?:\?[^'"<>\s)]+)?/gi;
  for (const match of decoded.matchAll(listUrlRe)) {
    addListUrlCandidate(candidates, match[0], baseUrl);
  }
}

function appendEntryUrlsFromText(candidates: Set<string>, text: string, baseUrl: string) {
  const decoded = text.replace(/&amp;/g, '&');
  const entryUrlRe = /(?:(?:https?:)?\/\/xyjw\.huas\.edu\.cn)?\/?(?:jsxsd\/)?xspj\/(?:xspj_find|xspj_list)\.do(?:\?[^'"<>\s)]+)?/gi;
  for (const match of decoded.matchAll(entryUrlRe)) {
    const url = safeJwMenuUrl(match[0], baseUrl) || safeJwUrl(match[0], baseUrl);
    if (url) candidates.add(url);
  }
}

function selectedSelectValue($: cheerio.CheerioAPI, select: any) {
  const selected = $(select).find('option[selected]').first();
  const option = selected.length ? selected : $(select).find('option').first();
  return option.attr('value') ?? option.text() ?? '';
}

function selectedFormValue($: cheerio.CheerioAPI, control: any) {
  if (control.tagName === 'select') return selectedSelectValue($, control);
  if (control.tagName === 'textarea') return $(control).text() ?? '';
  return $(control).attr('value') ?? '';
}

function appendFormListUrl(candidates: Set<string>, $: cheerio.CheerioAPI, form: any, pageUrl: string) {
  const node = $(form);
  const actionUrl = safeJwUrl(node.attr('action') || pageUrl, pageUrl);
  if (!actionUrl) return;

  try {
    const url = new URL(actionUrl);
    if (url.pathname !== EVALUATION_LIST_PATH) return;

    node.find('input,select,textarea').each((_, control) => {
      const field = $(control);
      const name = field.attr('name') || '';
      if (!name || field.is('[disabled]')) return;

      const type = (field.attr('type') || '').toLowerCase();
      if (['button', 'submit', 'reset', 'image', 'file'].includes(type)) return;
      if ((type === 'radio' || type === 'checkbox') && !field.is('[checked]')) return;
      url.searchParams.append(name, selectedFormValue($, control));
    });

    addListUrlCandidate(candidates, url.toString(), pageUrl);
  } catch {
    // 扫描上游 HTML 时忽略畸形 form action。
  }
}

function scoreListUrlCandidate(url: string) {
  const parsed = new URL(url);
  let score = parsed.search ? 1 : 0;
  if (parsed.searchParams.has('pj0502id')) score += 4;
  if (parsed.searchParams.has('xnxq01id')) score += 3;
  if (parsed.searchParams.has('pj01id')) score += 2;
  return score;
}

function pickBestListUrl(candidates: Set<string>) {
  return [...candidates].sort((a, b) => {
    const scoreDiff = scoreListUrlCandidate(b) - scoreListUrlCandidate(a);
    return scoreDiff || b.length - a.length;
  })[0] || null;
}

function ensureActiveSession(html: string) {
  const htmlStart = (html || '').slice(0, 800);
  if (!html.trim() || /cas\/login/i.test(htmlStart) || /LoginToXk/i.test(htmlStart) || /用户登录/.test(htmlStart)) {
    throw new Error('SESSION_EXPIRED');
  }

  const pageText = normalizeEvaluationText(cheerio.load(stripHtmlComments(html)).text());
  if (/Whitelabel Error Page|Internal Server Error|HTTP Status 5\d\d|系统异常|服务暂不可用|错误页面/.test(pageText)) {
    throw new Error('EVALUATION_UPSTREAM_ERROR_PAGE');
  }
}

function extractEvaluationListUrl(html: string, pageUrl: string) {
  ensureActiveSession(html);

  const activeHtml = stripHtmlComments(html);
  const candidates = new Set<string>();
  addListUrlCandidate(candidates, pageUrl, pageUrl);

  const $ = cheerio.load(activeHtml);
  $('a,area,iframe,frame,script,form').each((_, element) => {
    for (const attr of ['href', 'src', 'action', 'onclick', 'onClick']) {
      const value = $(element).attr(attr);
      if (value) appendListUrlsFromText(candidates, value, pageUrl);
    }
  });

  $('form').each((_, form) => appendFormListUrl(candidates, $, form, pageUrl));
  appendListUrlsFromText(candidates, activeHtml, pageUrl);
  return pickBestListUrl(candidates);
}

function extractEvaluationEntryUrls(html: string, pageUrl: string) {
  ensureActiveSession(html);

  const activeHtml = stripHtmlComments(html);
  const candidates = new Set<string>();
  const $ = cheerio.load(activeHtml);

  $('a,area,iframe,frame,form,[data-url]').each((_, element) => {
    const node = $(element);
    const text = normalizeEvaluationText(node.text());
    const dataUrl = node.attr('data-url');
    if (dataUrl && (/xspj/.test(dataUrl) || /评教|评价/.test(text))) {
      const url = safeJwMenuUrl(dataUrl, pageUrl);
      if (url) candidates.add(url);
    }

    for (const attr of ['href', 'src', 'action', 'onclick', 'onClick']) {
      const value = node.attr(attr);
      if (value && (/xspj|评教/.test(value) || /评教/.test(text))) {
        appendEntryUrlsFromText(candidates, value, pageUrl);
      }
    }
  });

  appendEntryUrlsFromText(candidates, activeHtml, pageUrl);
  return [...candidates].filter((url) => {
    const path = new URL(url).pathname;
    return path === EVALUATION_ENTRY_PATH || path === EVALUATION_LIST_PATH;
  });
}

function extractJwNavigationUrls(html: string, pageUrl: string) {
  ensureActiveSession(html);

  const candidates = new Set<string>();
  const $ = cheerio.load(html);
  $('a,area,iframe,frame,script').each((_, element) => {
    for (const attr of ['href', 'src']) {
      const value = $(element).attr(attr);
      if (!value) continue;
      const url = safeJwUrl(value, pageUrl);
      if (!url) continue;

      const path = new URL(url).pathname.toLowerCase();
      if (path.endsWith('.jsp') || path.endsWith('.do') || path.includes('/framework/') || path.includes('/xs_main') || path.includes('/menu')) {
        candidates.add(url);
      }
    }
  });
  return [...candidates];
}

export function isEvaluationSubmitted(value: string) {
  return value.includes('是') || /^yes$/i.test(value);
}

function extractListRows(html: string): EvaluationListRow[] {
  ensureActiveSession(html);

  const $ = cheerio.load(html);
  if (!$('#dataList').length) throw new Error('EVALUATION_LIST_INVALID');
  const rows: EvaluationListRow[] = [];

  $('#dataList tr').slice(1).each((_, tr) => {
    const cells = $(tr).find('td');
    if (cells.length < 8) return;

    let editUrl = '';
    $(tr).find('a[href*="xspj_edit.do"]').each((_, link) => {
      const href = $(link).attr('href') || '';
      if (!editUrl && !href.includes('type=view')) editUrl = new URL(href, URLS.jwBase).toString();
    });

    const submitted = normalizeEvaluationText($(cells[7]).text());
    const submittedFlag = isEvaluationSubmitted(submitted);
    const actionable = Boolean(editUrl) && !submittedFlag;
    const pending = !submittedFlag;
    rows.push({
      index: normalizeEvaluationText($(cells[0]).text()),
      teacherId: normalizeEvaluationText($(cells[1]).text()),
      teacherName: normalizeEvaluationText($(cells[2]).text()),
      college: normalizeEvaluationText($(cells[3]).text()),
      category: normalizeEvaluationText($(cells[4]).text()),
      totalScore: normalizeEvaluationText($(cells[5]).text()),
      evaluated: normalizeEvaluationText($(cells[6]).text()),
      submitted,
      pending,
      actionable,
      blocked: pending && !actionable,
      state: submittedFlag ? 'completed' : actionable ? 'pending' : 'blocked',
      editUrl,
    });
  });

  return rows;
}

function extractMaxScore($: cheerio.CheerioAPI, input: cheerio.Cheerio<any>) {
  const onchangeMatch = (input.attr('onchange') || '').match(/checkFz\(\s*this\s*,\s*['"]?(\d+(?:\.\d+)?)['"]?\s*\)/);
  if (onchangeMatch) return onchangeMatch[1];

  const cells = input.closest('tr').find('td,th')
    .map((_, cell) => normalizeEvaluationText($(cell).text()))
    .get();
  for (let i = cells.length - 1; i >= 0; i--) {
    if (/^\d+(?:\.\d+)?$/.test(cells[i])) return cells[i];
  }

  return normalizeEvaluationText(input.closest('tr').text()).match(/(\d+(?:\.\d+)?)\s*$/)?.[1] || '';
}

function parseScoreText(value: string | undefined) {
  const text = normalizeEvaluationText(value || '');
  if (!text) return null;
  if (/^\d+(?:\.\d+)?$/.test(text)) return Number(text);

  const score = Number(text.match(/(\d+(?:\.\d+)?)/)?.[1]);
  return Number.isFinite(score) ? score : null;
}

function extractRadioScore($: cheerio.CheerioAPI, radio: cheerio.Cheerio<any>) {
  const next = radio.next();
  const candidates = [
    radio.attr('data-score'),
    radio.attr('score'),
    next.attr('value'),
    next.text(),
    radio.closest('label').text(),
    radio.parent().text(),
  ];
  for (const candidate of candidates) {
    const score = parseScoreText(candidate);
    if (score !== null) return score;
  }
  return 0;
}

type ScoreRadio = { input: any; score: number };

function collectBestScoreRadios($: cheerio.CheerioAPI, form: cheerio.Cheerio<any>) {
  const groups = new Map<string, ScoreRadio[]>();
  form.find('input').each((_, input) => {
    const node = $(input);
    const name = node.attr('name') || '';
    if ((node.attr('type') || '').toLowerCase() !== 'radio' || !name.startsWith(SCORE_RADIO_PREFIX)) return;
    groups.set(name, [...(groups.get(name) || []), { input, score: extractRadioScore($, node) }]);
  });

  const selected = new Map<string, ScoreRadio>();
  groups.forEach((items, name) => {
    const best = items.reduce((current, item) => item.score > current.score ? item : current, items[0]);
    if (best) selected.set(name, best);
  });
  return selected;
}

function appendInput(
  $: cheerio.CheerioAPI,
  params: URLSearchParams,
  input: any,
  selectedScoreRadios: Map<string, ScoreRadio>,
) {
  const node = $(input);
  const name = node.attr('name') || '';
  if (!name) return;

  const type = (node.attr('type') || 'text').toLowerCase();
  if (['button', 'submit', 'reset', 'image', 'file'].includes(type)) return;
  if (type === 'radio') {
    const selected = selectedScoreRadios.get(name);
    if (selected) {
      if (selected.input !== input) return;
      params.append(name, node.attr('value') ?? '');
      return;
    }
    if (!node.is('[checked]')) return;
  }
  if (type === 'checkbox' && !node.is('[checked]')) return;

  if (name === 'issubmit') {
    params.append(name, '1');
    return;
  }
  if (name === 'sfxyt') {
    params.append(name, '0');
    return;
  }
  if (name.startsWith(SCORE_INPUT_PREFIX)) {
    const maxScore = extractMaxScore($, node);
    if (!maxScore) throw new AppError(ErrorCode.PARAM_ERROR, '评教评分项缺少最高分');
    params.append(name, maxScore);
    return;
  }
  params.append(name, node.attr('value') ?? '');
}

function buildFullScoreForm(html: string, pageUrl: string, comment: string): EvaluationForm {
  ensureActiveSession(html);

  const $ = cheerio.load(html);
  const form = $('form#Form1').length ? $('form#Form1').first() : $('form').first();
  if (!form.length) throw new AppError(ErrorCode.PARAM_ERROR, '未找到评教表单');

  const body = new URLSearchParams();
  const selectedScoreRadios = collectBestScoreRadios($, form);
  let questionCount = selectedScoreRadios.size;
  let fullScore = [...selectedScoreRadios.values()].reduce((sum, item) => sum + item.score, 0);

  form.find('input,select,textarea').each((_, control) => {
    const name = $(control).attr('name') || '';
    if (!name) return;

    if (control.tagName === 'input') {
      if (name.startsWith(SCORE_INPUT_PREFIX)) {
        const score = Number(extractMaxScore($, $(control)));
        if (Number.isFinite(score)) fullScore += score;
        questionCount += 1;
      }
      appendInput($, body, control, selectedScoreRadios);
      return;
    }
    if (control.tagName === 'textarea') {
      body.append(name, normalizeEvaluationText($(control).text()) || comment);
      return;
    }
    if (control.tagName === 'select') body.append(name, selectedSelectValue($, control));
  });

  if (questionCount === 0) throw new AppError(ErrorCode.PARAM_ERROR, '未找到评教评分项');
  return {
    actionUrl: new URL(form.attr('action') || '', pageUrl).toString(),
    body,
    questionCount,
    fullScore,
  };
}

export function assertSuccessfulEvaluationSubmitHtml(html: string) {
  ensureActiveSession(html);
  const text = normalizeEvaluationText(cheerio.load(stripHtmlComments(html)).text());
  if (/提交失败|保存失败|操作失败|系统异常|发生错误|错误信息|评分项.{0,12}不能为空/.test(text)) {
    throw new Error('SUBMIT_REJECTED');
  }
}

export const EvaluationParser = {
  extractEvaluationListUrl,
  extractEvaluationEntryUrls,
  extractJwNavigationUrls,
  extractListRows,
  buildFullScoreForm,
};
