/**
 * [INPUT]: 依赖 cheerio、URLS、config、upstream、AppError/ErrorCode、Logger 与 HttpClient
 * [OUTPUT]: 对外提供 EvaluationService 以及评教列表、发现、提交结果类型
 * [POS]: services/academic 的评教业务编排器，发现评教入口、解析列表、构造满分表单并提交上游
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import * as cheerio from 'cheerio';
import { URLS } from '../../core/url-config';
import { config } from '../../config';
import { upstream } from '../infra/upstream';
import { AppError, ErrorCode } from '../../utils/errors';
import { Logger } from '../../utils/logger';
import type { HttpClient } from '../../core/http-client';

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
}

export interface EvaluationSubmitItem extends EvaluationListItem {
  questionCount: number;
  fullScore: number;
  status: 'dry_run' | 'submitted' | 'skipped' | 'failed';
  message?: string;
}

export interface EvaluationDiscoveryResult {
  evaluationRequired: boolean;
  listUrl: string | null;
}

interface EvaluationListRow extends EvaluationListItem {
  editUrl: string;
}

interface BuildFormResult {
  actionUrl: string;
  body: URLSearchParams;
  questionCount: number;
  fullScore: number;
}

const DEFAULT_COMMENT = '好';
const MAX_LIST_URL_LENGTH = 500;
const MAX_DISCOVERY_PAGES = 8;
const SCORE_INPUT_PREFIX = 'sjfz_';
const SCORE_RADIO_PREFIX = 'pj0601id_';
const EVALUATION_LIST_PATH = '/jsxsd/xspj/xspj_list.do';
const EVALUATION_ENTRY_PATH = '/jsxsd/xspj/xspj_find.do';
const DISCOVERY_ENTRY_URLS = [
  URLS.jwMain,
  URLS.jwIndex,
  `${URLS.jwBase}/`,
];

function normalizeText(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function stripHtmlComments(html: string) {
  return html.replace(/<!--[\s\S]*?-->/g, '');
}

function assertJwEvaluationListUrl(rawUrl: string) {
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

function safeJwUrl(rawUrl: string, baseUrl: string) {
  const value = rawUrl.trim().replace(/&amp;/g, '&');
  if (!value || /^javascript:/i.test(value) || /^#/i.test(value)) return null;

  try {
    const normalized = value.startsWith('jsxsd/')
      ? `/${value}`
      : value;
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
  const url = safeJwUrl(rawUrl, baseUrl);
  if (!url) return;

  try {
    candidates.add(assertJwEvaluationListUrl(url));
  } catch {
    // ignore non-list or malformed links while scanning upstream HTML
  }
}

function appendListUrlsFromText(candidates: Set<string>, text: string, baseUrl: string) {
  const decoded = text.replace(/&amp;/g, '&');
  const listUrlRe = /(?:(?:https?:)?\/\/xyjw\.huas\.edu\.cn)?\/?jsxsd\/xspj\/xspj_list\.do(?:\?[^'"<>\s)]+)?/gi;
  for (const match of decoded.matchAll(listUrlRe)) {
    addListUrlCandidate(candidates, match[0], baseUrl);
  }
}

function appendEntryUrlsFromText(candidates: Set<string>, text: string, baseUrl: string) {
  const decoded = text.replace(/&amp;/g, '&');
  const entryUrlRe = /(?:(?:https?:)?\/\/xyjw\.huas\.edu\.cn)?\/?jsxsd\/xspj\/(?:xspj_find|xspj_list)\.do(?:\?[^'"<>\s)]+)?/gi;
  for (const match of decoded.matchAll(entryUrlRe)) {
    const url = safeJwUrl(match[0], baseUrl);
    if (url) candidates.add(url);
  }
}

function selectedFormValue($: cheerio.CheerioAPI, control: any) {
  if (control.tagName === 'select') {
    return selectedSelectValue($, control);
  }
  if (control.tagName === 'textarea') {
    return $(control).text() ?? '';
  }
  return $(control).attr('value') ?? '';
}

function appendFormListUrl(candidates: Set<string>, $: cheerio.CheerioAPI, form: any, pageUrl: string) {
  const node = $(form);
  const action = node.attr('action') || pageUrl;
  const actionUrl = safeJwUrl(action, pageUrl);
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
    // ignore malformed form action
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
    if (scoreDiff !== 0) return scoreDiff;
    return b.length - a.length;
  })[0] || null;
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
    const text = normalizeText(node.text());
    const dataUrl = node.attr('data-url');
    if (dataUrl && (/xspj/.test(dataUrl) || /评教|评价/.test(text))) {
      const url = safeJwMenuUrl(dataUrl, pageUrl);
      if (url) {
        candidates.add(url);
      }
    }

    for (const attr of ['href', 'src', 'action', 'onclick', 'onClick']) {
      const value = node.attr(attr);
      if (!value) continue;
      if (/xspj|评教/.test(value) || /评教/.test(text)) {
        appendEntryUrlsFromText(candidates, value, pageUrl);
      }
    }
  });

  appendEntryUrlsFromText(candidates, activeHtml, pageUrl);

  return [...candidates].filter((url) => {
    const parsed = new URL(url);
    return parsed.pathname === EVALUATION_ENTRY_PATH || parsed.pathname === EVALUATION_LIST_PATH;
  });
}

function extractJwNavigationUrls(html: string, pageUrl: string) {
  ensureActiveSession(html);

  const candidates = new Set<string>();
  const $ = cheerio.load(html);

  $('a,area,iframe,frame,script').each((_, element) => {
    const node = $(element);
    for (const attr of ['href', 'src']) {
      const value = node.attr(attr);
      if (!value) continue;
      const url = safeJwUrl(value, pageUrl);
      if (!url) continue;

      const parsed = new URL(url);
      const path = parsed.pathname.toLowerCase();
      if (
        path.endsWith('.jsp')
        || path.endsWith('.do')
        || path.includes('/framework/')
        || path.includes('/xs_main')
        || path.includes('/menu')
      ) {
        candidates.add(url);
      }
    }
  });

  return [...candidates];
}

function ensureActiveSession(html: string) {
  const htmlStart = (html || '').slice(0, 800);
  if (
    !html.trim()
    || /cas\/login/i.test(htmlStart)
    || /LoginToXk/i.test(htmlStart)
    || /用户登录/.test(htmlStart)
  ) {
    throw new Error('SESSION_EXPIRED');
  }
}

function isSubmitted(value: string) {
  return value.includes('是') || /^yes$/i.test(value);
}

function extractListRows(html: string): EvaluationListRow[] {
  ensureActiveSession(html);

  const $ = cheerio.load(html);
  const rows: EvaluationListRow[] = [];

  $('#dataList tr').slice(1).each((_, tr) => {
    const cells = $(tr).find('td');
    if (cells.length < 8) return;

    const links = $(tr).find('a[href*="xspj_edit.do"]');
    let editUrl = '';
    links.each((_, link) => {
      const href = $(link).attr('href') || '';
      if (!editUrl && !href.includes('type=view')) {
        editUrl = new URL(href, URLS.jwBase).toString();
      }
    });

    const submitted = normalizeText($(cells[7]).text());
    const item = {
      index: normalizeText($(cells[0]).text()),
      teacherId: normalizeText($(cells[1]).text()),
      teacherName: normalizeText($(cells[2]).text()),
      college: normalizeText($(cells[3]).text()),
      category: normalizeText($(cells[4]).text()),
      totalScore: normalizeText($(cells[5]).text()),
      evaluated: normalizeText($(cells[6]).text()),
      submitted,
      pending: Boolean(editUrl) && !isSubmitted(submitted),
      editUrl,
    };

    rows.push(item);
  });

  return rows;
}

function selectedSelectValue($: cheerio.CheerioAPI, select: any) {
  const selected = $(select).find('option[selected]').first();
  const option = selected.length ? selected : $(select).find('option').first();
  return option.attr('value') ?? option.text() ?? '';
}

function extractMaxScore($: cheerio.CheerioAPI, input: cheerio.Cheerio<any>) {
  const onchange = input.attr('onchange') || '';
  const onchangeMatch = onchange.match(/checkFz\(\s*this\s*,\s*['"]?(\d+(?:\.\d+)?)['"]?\s*\)/);
  if (onchangeMatch) return onchangeMatch[1];

  const cells = input.closest('tr').find('td,th')
    .map((_, cell) => normalizeText($(cell).text()))
    .get();
  for (let i = cells.length - 1; i >= 0; i--) {
    if (/^\d+(?:\.\d+)?$/.test(cells[i])) return cells[i];
  }

  const rowText = normalizeText(input.closest('tr').text());
  const textMatch = rowText.match(/(\d+(?:\.\d+)?)\s*$/);
  return textMatch?.[1] || '';
}

function parseScoreText(value: string | undefined) {
  const text = normalizeText(value || '');
  if (!text) return null;

  if (/^\d+(?:\.\d+)?$/.test(text)) {
    return Number(text);
  }

  const match = text.match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const score = Number(match[1]);
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

function collectBestScoreRadios($: cheerio.CheerioAPI, form: cheerio.Cheerio<any>) {
  const groups = new Map<string, Array<{ input: any; score: number }>>();

  form.find('input').each((_, input) => {
    const node = $(input);
    const type = (node.attr('type') || '').toLowerCase();
    const name = node.attr('name') || '';
    if (type !== 'radio' || !name.startsWith(SCORE_RADIO_PREFIX)) return;

    const current = groups.get(name) || [];
    current.push({ input, score: extractRadioScore($, node) });
    groups.set(name, current);
  });

  const selected = new Map<string, { input: any; score: number }>();
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
  selectedScoreRadios: Map<string, { input: any; score: number }>,
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
    if (!maxScore) {
      throw new AppError(ErrorCode.PARAM_ERROR, '评教评分项缺少最高分');
    }
    params.append(name, maxScore);
    return;
  }

  params.append(name, node.attr('value') ?? '');
}

function buildFullScoreForm(html: string, pageUrl: string, comment: string): BuildFormResult {
  ensureActiveSession(html);

  const $ = cheerio.load(html);
  const form = $('form#Form1').length ? $('form#Form1').first() : $('form').first();
  if (!form.length) {
    throw new AppError(ErrorCode.PARAM_ERROR, '未找到评教表单');
  }

  const params = new URLSearchParams();
  const selectedScoreRadios = collectBestScoreRadios($, form);
  let questionCount = 0;
  let fullScore = 0;

  selectedScoreRadios.forEach((selected) => {
    questionCount += 1;
    fullScore += selected.score;
  });

  form.find('input,select,textarea').each((_, control) => {
    if (control.tagName === 'input') {
      const name = $(control).attr('name') || '';
      if (name.startsWith(SCORE_INPUT_PREFIX)) {
        const score = Number(extractMaxScore($, $(control)));
        if (Number.isFinite(score)) fullScore += score;
        questionCount += 1;
      }
      appendInput($, params, control, selectedScoreRadios);
      return;
    }

    const name = $(control).attr('name') || '';
    if (!name) return;

    if (control.tagName === 'textarea') {
      const value = normalizeText($(control).text()) || comment;
      params.append(name, value);
      return;
    }

    if (control.tagName === 'select') {
      params.append(name, selectedSelectValue($, control));
    }
  });

  if (questionCount === 0) {
    throw new AppError(ErrorCode.PARAM_ERROR, '未找到评教评分项');
  }

  return {
    actionUrl: new URL(form.attr('action') || '', pageUrl).toString(),
    body: params,
    questionCount,
    fullScore,
  };
}

function toPublicItem(row: EvaluationListRow): EvaluationListItem {
  const { editUrl: _editUrl, ...item } = row;
  return item;
}

export class EvaluationService {
  static async discoverListUrlFromClient(client: HttpClient): Promise<EvaluationDiscoveryResult> {
    const queue = [...DISCOVERY_ENTRY_URLS];
    const visited = new Set<string>();

    while (queue.length > 0 && visited.size < MAX_DISCOVERY_PAGES) {
      const pageUrl = queue.shift();
      if (!pageUrl || visited.has(pageUrl)) continue;
      visited.add(pageUrl);

      const res = await client.request(pageUrl, { timeout: config.timeout.business });
      const location = res.headers.get('location');
      if (location) {
        const nextUrl = safeJwUrl(location, pageUrl);
        if (nextUrl) {
          const listUrl = new URL(nextUrl).pathname === EVALUATION_LIST_PATH
            ? assertJwEvaluationListUrl(nextUrl)
            : null;
          if (listUrl) return { evaluationRequired: true, listUrl };
          if (!visited.has(nextUrl)) queue.unshift(nextUrl);
        }
        continue;
      }

      const html = await res.text();
      const listUrl = extractEvaluationListUrl(html, pageUrl);
      if (listUrl) return { evaluationRequired: true, listUrl };

      for (const entryUrl of extractEvaluationEntryUrls(html, pageUrl)) {
        if (!visited.has(entryUrl)) queue.unshift(entryUrl);
      }
      for (const navUrl of extractJwNavigationUrls(html, pageUrl)) {
        if (!visited.has(navUrl)) queue.push(navUrl);
      }
    }

    return { evaluationRequired: false, listUrl: null };
  }

  static async discoverListUrl(userId: number) {
    return upstream(userId, 'jw', async ({ client }) => {
      return this.discoverListUrlFromClient(client);
    });
  }

  static async getStatus(userId: number, listUrl: string) {
    const safeUrl = assertJwEvaluationListUrl(listUrl);

    return upstream(userId, 'jw', async ({ client }) => {
      const res = await client.request(safeUrl, { timeout: config.timeout.business });
      const rows = extractListRows(await res.text());
      const items = rows.map(toPublicItem);

      return {
        total: items.length,
        pendingCount: items.filter((item) => item.pending).length,
        items,
      };
    });
  }

  static async submitFullScore(
    userId: number,
    listUrl: string,
    options: { dryRun?: boolean; comment?: string } = {},
  ) {
    const safeUrl = assertJwEvaluationListUrl(listUrl);
    const dryRun = options.dryRun ?? true;
    const comment = normalizeText(options.comment || DEFAULT_COMMENT) || DEFAULT_COMMENT;

    return upstream(userId, 'jw', async ({ client }) => {
      const listRes = await client.request(safeUrl, { timeout: config.timeout.business });
      const rows = extractListRows(await listRes.text());
      const pendingRows = rows.filter((row) => row.pending);
      const results: EvaluationSubmitItem[] = [];

      for (const row of pendingRows) {
        const baseItem = toPublicItem(row);
        try {
          const editRes = await client.request(row.editUrl, { timeout: config.timeout.business });
          const form = buildFullScoreForm(await editRes.text(), row.editUrl, comment);

          if (dryRun) {
            results.push({
              ...baseItem,
              questionCount: form.questionCount,
              fullScore: form.fullScore,
              status: 'dry_run',
            });
            continue;
          }

          try {
            const submitRes = await client.request(form.actionUrl, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Referer: row.editUrl,
              },
              body: form.body,
              timeout: config.timeout.business,
            });

            results.push({
              ...baseItem,
              questionCount: form.questionCount,
              fullScore: form.fullScore,
              status: submitRes.status >= 200 && submitRes.status < 400 ? 'submitted' : 'failed',
              message: `status=${submitRes.status}`,
            });
          } catch (error: any) {
            results.push({
              ...baseItem,
              questionCount: form.questionCount,
              fullScore: form.fullScore,
              status: 'failed',
              message: String(error?.message || 'SUBMIT_FAILED'),
            });
          }
        } catch (error: any) {
          results.push({
            ...baseItem,
            questionCount: 0,
            fullScore: 0,
            status: 'failed',
            message: String(error?.message || 'BUILD_FORM_FAILED'),
          });
        }
      }

      Logger.operation(
        'Evaluation',
        dryRun ? '评教满分组参预检' : '评教满分提交',
        undefined,
        undefined,
        `pending=${pendingRows.length}; ok=${results.filter((item) => item.status === 'submitted' || item.status === 'dry_run').length}`,
      );

      return {
        dryRun,
        total: rows.length,
        pendingCount: pendingRows.length,
        successCount: results.filter((item) => item.status === 'submitted' || item.status === 'dry_run').length,
        failedCount: results.filter((item) => item.status === 'failed').length,
        items: results,
      };
    });
  }
}

export const EvaluationParser = {
  extractEvaluationListUrl,
  extractEvaluationEntryUrls,
  extractJwNavigationUrls,
  extractListRows,
  buildFullScoreForm,
};
