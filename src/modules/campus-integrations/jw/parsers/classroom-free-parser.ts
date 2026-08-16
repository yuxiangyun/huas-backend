/**
 * [INPUT]: 依赖 cheerio、SESSION_EXPIRED_INDICATORS、共享 JW 登录页判定与教室楼栋白名单
 * [OUTPUT]: 对外提供 ClassroomFreeParser、ClassroomBuilding、FreeClassroom 与 SPECIAL_CLASSROOM_RE，并拒绝登录页/通用错误页/未知结构
 * [POS]: campus-integrations/jw/parsers 的空教室纯解析器，以目标结构证明合法空态并处理教务 HTML/JSON 混合响应
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import * as cheerio from 'cheerio';
import { SESSION_EXPIRED_INDICATORS } from '../../../../config';
import { looksLikeJwLoginPage } from './session-page';

export const SPECIAL_CLASSROOM_RE =
  /(艺术|体育|图书馆|办公|食堂|化学|化工|物理|音乐|琴|舞蹈|美术|画|球|场|田径|武术|练功|游泳|跆拳道|健身|乒乓|羽毛|保卫|宿舍|浴|船型|红楼)/;

const ALLOWED_BUILDING_IDS = new Set([
  'A12',
  'A16',
  'A17',
  'A18',
  'A19',
  'A21',
  'A29',
  'A30',
  '35EDB61D8D254A78A0D1F6527D411E4B',
  '26215940BF834A19B9B149D49AC6F19A',
  'B03',
  'B04',
]);

export interface ClassroomBuilding {
  campusId: 'A' | 'B';
  campusName: string;
  buildingId: string;
  buildingName: string;
}

export interface FreeClassroom {
  id: string;
  name: string;
  capacity: number;
  examCapacity: number;
}

const CAMPUS_NAMES: Record<'A' | 'B', string> = {
  A: '西院',
  B: '东院',
};

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function looksLikeExpired(html: string): boolean {
  const htmlStart = (html || '').substring(0, 500);
  if (!html.trim()) return true;
  return SESSION_EXPIRED_INDICATORS.some((indicator) => htmlStart.includes(indicator)) ||
    looksLikeJwLoginPage(html);
}

function assertActiveResponse(raw: string): void {
  if (looksLikeExpired(raw)) throw new Error('SESSION_EXPIRED');

  const text = normalizeText(cheerio.load(raw).text());
  if (/Whitelabel Error Page|Internal Server Error|HTTP Status 5\d\d|系统异常|服务暂不可用|错误页面/.test(text)) {
    throw new Error('CLASSROOM_UPSTREAM_ERROR_PAGE');
  }
}

function isPlainClassroomName(name: string): boolean {
  return !SPECIAL_CLASSROOM_RE.test(name);
}

function isAllowedBuilding(buildingId: string): boolean {
  return ALLOWED_BUILDING_IDS.has(buildingId);
}

function pickString(source: any, keys: string[]): string {
  if (!source || typeof source !== 'object') return '';

  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null) {
      return String(value).trim();
    }
  }

  return '';
}

function parseJsonBuildingItems(raw: string): { recognized: boolean; items: any[] } {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return { recognized: true, items: parsed };
    if (Array.isArray(parsed?.data)) return { recognized: true, items: parsed.data };
    if (Array.isArray(parsed?.rows)) return { recognized: true, items: parsed.rows };
    if (Array.isArray(parsed?.list)) return { recognized: true, items: parsed.list };
  } catch {
    // Fall back to HTML option parsing below.
  }

  return { recognized: false, items: [] };
}

export const ClassroomFreeParser = {
  campusName(campusId: 'A' | 'B'): string {
    return CAMPUS_NAMES[campusId];
  },

  isSpecialName(name: string): boolean {
    return !isPlainClassroomName(name);
  },

  parseCurrentTerm(html: string): string | null {
    assertActiveResponse(html);

    const $ = cheerio.load(html);
    const selected = normalizeText(
      $('select[name="xnxqh"] option[selected], select[name="xnxq"] option[selected], select[name="xnxqh"] option:selected, select[name="xnxq"] option:selected')
        .first()
        .attr('value') || ''
    );
    if (/^\d{4}-\d{4}-[12]$/.test(selected)) return selected;

    const inputTerm = normalizeText(
      $('input[name="xnxqh"], input[name="xnxq"], input[name="xnxq01id"]').first().attr('value') || ''
    );
    if (/^\d{4}-\d{4}-[12]$/.test(inputTerm)) return inputTerm;

    const match = html.match(/\b\d{4}-\d{4}-[12]\b/);
    return match?.[0] || null;
  },

  parseCurrentWeek(html: string): number | null {
    assertActiveResponse(html);

    const text = normalizeText(cheerio.load(html).text());
    if (text.includes('当前日期不在教学周历内')) return null;

    const match = html.match(/第\s*(\d{1,2})\s*周/);
    if (!match) return null;

    const week = Number(match[1]);
    return Number.isInteger(week) && week >= 1 && week <= 30 ? week : null;
  },

  parseBuildings(raw: string, campusId: 'A' | 'B'): ClassroomBuilding[] {
    assertActiveResponse(raw);

    const campusName = CAMPUS_NAMES[campusId];
    const buildings: ClassroomBuilding[] = [];
    const json = parseJsonBuildingItems(raw);

    for (const item of json.items) {
      const buildingId = pickString(item, ['jxlbh', 'JXLBH', 'dm', 'DM', 'id', 'ID', 'value', 'VALUE']);
      const buildingName = pickString(item, ['jxlmc', 'JXLMC', 'dmmc', 'DMMC', 'mc', 'MC', 'name', 'NAME', 'text', 'TEXT', 'label', 'LABEL']);
      if (buildingId && buildingName && (isAllowedBuilding(buildingId) || isPlainClassroomName(buildingName))) {
        buildings.push({ campusId, campusName, buildingId, buildingName });
      }
    }

    if (buildings.length > 0 || json.recognized) return buildings;

    const $ = cheerio.load(raw);
    const options = $('option[value]');
    options.each((_, option) => {
      const buildingId = normalizeText($(option).attr('value') || '');
      const buildingName = normalizeText($(option).text());
      if (!buildingId || !buildingName || buildingId === '-1') return;
      if (!isAllowedBuilding(buildingId) && !isPlainClassroomName(buildingName)) return;
      buildings.push({ campusId, campusName, buildingId, buildingName });
    });

    if (options.length > 0) return buildings;
    throw new Error('CLASSROOM_BUILDINGS_PAGE_INVALID');
  },

  parseFreeRooms(html: string): FreeClassroom[] {
    assertActiveResponse(html);

    const $ = cheerio.load(html);
    if (!$('#dataList').length) throw new Error('CLASSROOM_FREE_PAGE_INVALID');
    const rooms: FreeClassroom[] = [];

    $('#dataList tr[jsbh]').each((_, row) => {
      const id = normalizeText($(row).attr('jsbh') || $(row).find('input[name="jsids"]').attr('value') || '');
      const raw = normalizeText($(row).find('td').first().text());
      const match = raw.match(/^(.+?)\((\d+)\/(\d+)\)$/);
      if (!id || !match) return;

      const name = normalizeText(match[1]);
      if (!isPlainClassroomName(name)) return;

      rooms.push({
        id,
        name,
        capacity: Number(match[2]),
        examCapacity: Number(match[3]),
      });
    });

    return rooms;
  },
};
