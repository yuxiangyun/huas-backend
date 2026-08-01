/**
 * [INPUT]: 依赖首页弹窗 canonical 服务、完整应用组合、后台 Cookie 会话与隔离文件根
 * [OUTPUT]: 验证首页弹窗启停/时间窗、三态底栏、内容版本、multipart/旧后台兼容、失败补偿、并发写锁、公开 null 与最近三版媒体契约
 * [POS]: tests 的 Operations 首页弹窗端到端回归套件，锁定管理写入到匿名消费的最小跨端协议
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { afterAll, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import * as fsPromises from 'node:fs/promises';
import { readFile, readdir, rm } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import sharp from 'sharp';
import { createApp } from '../src/app';
import { createApplicationComposition } from '../src/composition';
import { config } from '../src/config';
import {
  INDEX_POPUP_MEDIA_BASE_PATH,
  IndexPopupService,
} from '../src/modules/operations/infrastructure/index-popup-service';

const composition = createApplicationComposition();
const app = createApp(composition.app, { development: false });
const storageRoot = join(dirname(config.dbPath), 'index-popup');
const settingsFile = join(storageRoot, 'settings.json');
const PNG = await sharp({
  create: { width: 2, height: 3, channels: 3, background: '#336699' },
}).png().toBuffer();

afterAll(() => composition.dispose());

beforeEach(async () => {
  await rm(storageRoot, { recursive: true, force: true });
});

function image(name = 'poster.png') {
  return new File([PNG], name, { type: 'image/png' });
}

async function adminCookie() {
  const response = await app.request('http://localhost/api/admin/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'test-admin', password: 'test-admin-password' }),
  });
  expect(response.status).toBe(200);
  return (response.headers.get('set-cookie') || '').split(';')[0];
}

function settingsForm(overrides: Partial<Record<'enabled' | 'frequency' | 'actionType' | 'actionText' | 'startsAt' | 'endsAt', string>> = {}, poster?: File) {
  const form = new FormData();
  form.set('enabled', overrides.enabled ?? 'true');
  form.set('frequency', overrides.frequency ?? 'daily');
  form.set('actionType', overrides.actionType ?? 'public_account');
  form.set('actionText', overrides.actionText ?? '了解更多');
  form.set('startsAt', overrides.startsAt ?? '');
  form.set('endsAt', overrides.endsAt ?? '');
  if (poster) form.set('image', poster);
  return form;
}

describe('IndexPopupService', () => {
  it('默认关闭且公开读取返回 null', async () => {
    expect(await IndexPopupService.getAdmin()).toEqual({
      enabled: false,
      version: null,
      imageUrl: null,
      actionType: 'public_account',
      actionText: '了解更多',
      frequency: 'daily',
      startsAt: null,
      endsAt: null,
      updatedAt: null,
    });
    expect(await IndexPopupService.getPublic()).toBeNull();
  });

  it('兼容旧配置缺少动作字段并默认公众号动作', async () => {
    await fsPromises.mkdir(storageRoot, { recursive: true });
    await fsPromises.writeFile(settingsFile, `${JSON.stringify({
      enabled: false,
      version: null,
      imageUrl: null,
      frequency: 'daily',
      startsAt: null,
      endsAt: null,
      updatedAt: null,
    })}\n`);

    expect(await IndexPopupService.getAdmin()).toMatchObject({
      actionType: 'public_account',
      actionText: '了解更多',
    });
  });

  it('按启用状态与半开时间窗过滤公开配置', async () => {
    const configured = await IndexPopupService.update({
      enabled: true,
      frequency: 'once',
      startsAt: '2026-08-01T08:00:00+08:00',
      endsAt: '2026-08-02T08:00:00+08:00',
      image: image(),
    });

    expect(await IndexPopupService.getPublic(new Date('2026-08-01T07:59:59+08:00'))).toBeNull();
    expect(await IndexPopupService.getPublic(new Date('2026-08-01T08:00:00+08:00'))).toEqual({
      version: configured.version,
      imageUrl: configured.imageUrl,
      actionType: 'public_account',
      actionText: '了解更多',
      frequency: 'once',
    });
    expect(await IndexPopupService.getPublic(new Date('2026-08-02T08:00:00+08:00'))).toBeNull();

    await IndexPopupService.update({ enabled: false, frequency: 'once' });
    expect(await IndexPopupService.getPublic(new Date('2026-08-01T12:00:00+08:00'))).toBeNull();
  });

  it('三态动作均公开返回，动作类型变化复制海报并生成内容版本', async () => {
    const initial = await IndexPopupService.update({
      enabled: true,
      frequency: 'daily',
      actionType: 'public_account',
      actionText: '进入公众号',
      image: image(),
    });
    const text = await IndexPopupService.update({
      enabled: true,
      frequency: 'daily',
      actionType: 'text',
      actionText: '校园活动说明',
    });
    expect(text.version).not.toBe(initial.version);
    expect(await IndexPopupService.getPublicFile(text.imageUrl!)).not.toBeNull();
    expect(await IndexPopupService.getPublic()).toMatchObject({
      actionType: 'text',
      actionText: '校园活动说明',
    });

    const none = await IndexPopupService.update({
      enabled: true,
      frequency: 'daily',
      actionType: 'none',
      actionText: '',
    });
    expect(none.version).not.toBe(text.version);
    expect(none.actionText).toBe('校园活动说明');
    expect(await IndexPopupService.getPublic()).toMatchObject({
      actionType: 'none',
      actionText: '校园活动说明',
    });

    const policyOnly = await IndexPopupService.update({
      enabled: true,
      frequency: 'startup',
    });
    expect(policyOnly.version).toBe(none.version);
  });

  it('换图或修改展示文字生成新版本，投放设置不换版本', async () => {
    const first = await IndexPopupService.update({ enabled: true, frequency: 'daily', image: image() });
    const changedPolicy = await IndexPopupService.update({ enabled: true, frequency: 'startup' });
    expect(changedPolicy.version).toBe(first.version);

    const changedText = await IndexPopupService.update({
      enabled: true,
      frequency: 'startup',
      actionText: '查看活动',
    });
    expect(changedText.version).not.toBe(first.version);
    expect(changedText.actionText).toBe('查看活动');
    expect(await IndexPopupService.getPublicFile(first.imageUrl!)).not.toBeNull();

    const second = await IndexPopupService.update({ enabled: true, frequency: 'startup', image: image('next.png') });
    expect(second.version).not.toBe(changedText.version);
    expect(second.version).not.toBe(first.version);
    expect(second.imageUrl).toBe(`${INDEX_POPUP_MEDIA_BASE_PATH}/${second.version}.webp`);
    expect(await IndexPopupService.getPublicFile(changedText.imageUrl!)).not.toBeNull();
    expect(JSON.parse(await readFile(settingsFile, 'utf8'))).toEqual(second);
    const fourth = await IndexPopupService.update({ enabled: true, frequency: 'startup', actionText: '活动详情' });
    expect((await readdir(join(storageRoot, 'media'))).filter((name) => name.endsWith('.webp'))).toHaveLength(3);
    expect(await IndexPopupService.getPublicFile(first.imageUrl!)).toBeNull();
    expect(await IndexPopupService.getPublicFile(changedText.imageUrl!)).not.toBeNull();
    expect(await IndexPopupService.getPublicFile(second.imageUrl!)).not.toBeNull();
    expect(await IndexPopupService.getPublicFile(fourth.imageUrl!)).not.toBeNull();
    expect((await readdir(storageRoot)).some((name) => name.endsWith('.tmp'))).toBe(false);
  });

  it('配置原子替换失败时保留旧设置并清理临时文件', async () => {
    const initial = await IndexPopupService.update({ enabled: true, frequency: 'daily', image: image() });
    const renameSpy = spyOn(fsPromises, 'rename').mockRejectedValueOnce(new Error('rename failed'));
    try {
      await expect(IndexPopupService.update({ enabled: false, frequency: 'once' }))
        .rejects.toThrow('rename failed');
      expect(JSON.parse(await readFile(settingsFile, 'utf8'))).toEqual(initial);
      expect((await readdir(storageRoot)).some((name) => name.endsWith('.tmp'))).toBe(false);
    } finally {
      renameSpy.mockRestore();
    }
  });

  it('换图候选已落盘但配置切换失败时清理候选并保留旧版本', async () => {
    const initial = await IndexPopupService.update({ enabled: true, frequency: 'daily', image: image() });
    const originalRename = fsPromises.rename;
    let renameCount = 0;
    const renameSpy = spyOn(fsPromises, 'rename').mockImplementation(async (from, to) => {
      renameCount += 1;
      if (renameCount === 2) throw new Error('settings rename failed');
      return originalRename(from, to);
    });
    try {
      await expect(IndexPopupService.update({
        enabled: true,
        frequency: 'daily',
        image: image('candidate.png'),
      })).rejects.toThrow('settings rename failed');
      expect(JSON.parse(await readFile(settingsFile, 'utf8'))).toEqual(initial);
      expect((await readdir(join(storageRoot, 'media'))).filter((name) => name.endsWith('.webp')))
        .toEqual([`${initial.version}.webp`]);
    } finally {
      renameSpy.mockRestore();
    }
  });

  it('并发内容写入串行化且最终配置与最后一个内容版本同构', async () => {
    const initial = await IndexPopupService.update({ enabled: true, frequency: 'daily', image: image() });
    const [first, second] = await Promise.all([
      IndexPopupService.update({ enabled: true, frequency: 'daily', actionText: '第一版' }),
      IndexPopupService.update({ enabled: true, frequency: 'daily', actionText: '第二版' }),
    ]);

    expect(first.version).not.toBe(initial.version);
    expect(second.version).not.toBe(first.version);
    expect((await IndexPopupService.getAdmin()).actionText).toBe('第二版');
    expect(JSON.parse(await readFile(settingsFile, 'utf8')).version).toBe(second.version);
  });

  it('动作内容复制源图片失败时不切换配置或生成候选版本', async () => {
    const initial = await IndexPopupService.update({ enabled: true, frequency: 'daily', image: image() });
    await rm(join(storageRoot, 'media', `${initial.version}.webp`));

    await expect(IndexPopupService.update({
      enabled: true,
      frequency: 'daily',
      actionType: 'text',
      actionText: '复制失败',
    })).rejects.toThrow();
    expect(JSON.parse(await readFile(settingsFile, 'utf8'))).toEqual(initial);
    expect(await readdir(join(storageRoot, 'media'))).toEqual([]);
  });

  it('拒绝无图片启用、非法频率与倒置时间窗', async () => {
    await expect(IndexPopupService.update({ enabled: true, frequency: 'daily' }))
      .rejects.toThrow('启用首页弹窗前必须上传图片');
    await expect(IndexPopupService.update({ enabled: false, frequency: 'hourly' }))
      .rejects.toThrow('frequency 必须是 once、daily 或 startup');
    await expect(IndexPopupService.update({ enabled: false, frequency: 'daily', actionType: 'link' }))
      .rejects.toThrow('actionType 必须是 public_account、text 或 none');
    await expect(IndexPopupService.update({ enabled: false, frequency: 'daily', actionType: '' }))
      .rejects.toThrow('actionType 必须是 public_account、text 或 none');
    await expect(IndexPopupService.update({ enabled: false, frequency: 'daily', actionText: '   ' }))
      .rejects.toThrow('actionText 不能为空');
    await expect(IndexPopupService.update({ enabled: false, frequency: 'daily', actionText: '超'.repeat(21) }))
      .rejects.toThrow('actionText 最多 20 个字符且不能包含控制字符');
    await expect(IndexPopupService.update({
      enabled: false,
      frequency: 'daily',
      startsAt: '2026-08-02T00:00',
      endsAt: '2026-08-01T00:00',
    })).rejects.toThrow('endsAt 必须晚于 startsAt');
  });
});

describe('index popup HTTP contract', () => {
  it('公开接口无需认证且无有效投放时返回 data:null', async () => {
    const response = await app.request('http://localhost/api/public/index-popup');
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, data: null });
  });

  it('后台 multipart 保存精确 DTO，公开媒体可读并使用不可变缓存', async () => {
    const cookie = await adminCookie();
    const update = await app.request('http://localhost/api/admin/index-popup', {
      method: 'PUT',
      headers: { Cookie: cookie },
      body: settingsForm({ frequency: 'startup', actionType: 'text' }, image()),
    });
    expect(update.status).toBe(200);
    const updatedBody = await update.json() as any;
    expect(updatedBody.data).toMatchObject({
      enabled: true,
      actionType: 'text',
      actionText: '了解更多',
      frequency: 'startup',
      startsAt: null,
      endsAt: null,
    });
    expect(typeof updatedBody.data.version).toBe('string');
    expect(updatedBody.data.imageUrl).toBe(`${INDEX_POPUP_MEDIA_BASE_PATH}/${updatedBody.data.version}.webp`);

    const adminGet = await app.request('http://localhost/api/admin/index-popup', { headers: { Cookie: cookie } });
    expect((await adminGet.json() as any).data).toEqual(updatedBody.data);
    const publicGet = await app.request('http://localhost/api/public/index-popup');
    expect((await publicGet.json() as any).data).toEqual({
      version: updatedBody.data.version,
      imageUrl: updatedBody.data.imageUrl,
      actionType: 'text',
      actionText: '了解更多',
      frequency: 'startup',
    });

    const media = await app.request(`http://localhost${updatedBody.data.imageUrl}`);
    expect(media.status).toBe(200);
    expect(media.headers.get('content-type')).toBe('image/webp');
    expect(media.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
  });

  it('后台接口受 Cookie 保护并稳定返回 multipart 参数错误', async () => {
    expect((await app.request('http://localhost/api/admin/index-popup')).status).toBe(401);
    const cookie = await adminCookie();
    const response = await app.request('http://localhost/api/admin/index-popup', {
      method: 'PUT',
      headers: { Cookie: cookie },
      body: settingsForm({ frequency: 'hourly', enabled: 'false' }),
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ success: false, error_code: 4002 });

    const emptyActionType = await app.request('http://localhost/api/admin/index-popup', {
      method: 'PUT',
      headers: { Cookie: cookie },
      body: settingsForm({ actionType: '', enabled: 'false' }),
    });
    expect(emptyActionType.status).toBe(400);
    expect(await emptyActionType.json()).toMatchObject({ success: false, error_code: 4002 });
  });

  it('旧后台省略动作字段时沿用当前三态配置', async () => {
    await IndexPopupService.update({
      enabled: true,
      frequency: 'daily',
      actionType: 'text',
      actionText: '保留文字',
      image: image(),
    });
    const cookie = await adminCookie();
    const legacyForm = new FormData();
    legacyForm.set('enabled', 'true');
    legacyForm.set('frequency', 'startup');
    legacyForm.set('startsAt', '');
    legacyForm.set('endsAt', '');

    const response = await app.request('http://localhost/api/admin/index-popup', {
      method: 'PUT',
      headers: { Cookie: cookie },
      body: legacyForm,
    });
    expect(response.status).toBe(200);
    expect((await response.json() as any).data).toMatchObject({
      actionType: 'text',
      actionText: '保留文字',
      frequency: 'startup',
    });
  });
});
