/**
 * [INPUT]: 依赖共享图片工具、sharp、Bun File API 与真实 HEIC 测试夹具
 * [OUTPUT]: 覆盖真实格式识别、输入门禁、EXIF 旋转、缩放裁切、动画保留、HEIC 兜底与 WebP 输出回归
 * [POS]: tests 的共享图片纯转换测试，隔离验证各媒体 adapter 共同依赖的无状态能力
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { describe, expect, it } from 'bun:test';
import sharp from 'sharp';
import { join } from 'node:path';
import { transformImageToWebp } from '../src/utils/image';
import { AppError, ErrorCode } from '../src/utils/errors';

const DEFAULT_OPTIONS = {
  maxInputBytes: 32 * 1024 * 1024,
  maxDimension: 128,
  quality: 78,
} as const;

describe('transformImageToWebp', () => {
  it('按真实内容识别图片，不信任文件扩展名或 MIME', async () => {
    const png = await sharp({
      create: { width: 96, height: 64, channels: 3, background: '#4488cc' },
    }).png().toBuffer();
    const disguised = new File([png], 'actually-not-jpeg.jpg', { type: 'text/plain' });

    const result = await transformImageToWebp(disguised, DEFAULT_OPTIONS);
    const metadata = await sharp(result.data).metadata();

    expect(metadata.format).toBe('webp');
    expect(result.mimeType).toBe('image/webp');
    expect(result.sizeBytes).toBe(result.data.byteLength);
    expect(result.width).toBe(96);
    expect(result.height).toBe(64);
  });

  it('拒绝伪装成图片的非图片内容', async () => {
    const disguised = new File(['not an image'], 'fake.png', { type: 'image/png' });

    await expect(transformImageToWebp(disguised, DEFAULT_OPTIONS)).rejects.toMatchObject({
      code: ErrorCode.PARAM_ERROR,
    } satisfies Partial<AppError>);
  });

  it('应用 EXIF 方向并按最长边等比缩小且不放大', async () => {
    const orientedJpeg = await sharp({
      create: { width: 120, height: 60, channels: 3, background: '#cc8844' },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();

    const result = await transformImageToWebp(
      new File([orientedJpeg], 'oriented.jpg'),
      { ...DEFAULT_OPTIONS, maxDimension: 80, fit: 'inside' },
    );

    expect(result.width).toBe(40);
    expect(result.height).toBe(80);
    expect(Math.max(result.width, result.height)).toBeLessThanOrEqual(80);
  });

  it('cover 模式输出固定正方形', async () => {
    const widePng = await sharp({
      create: { width: 180, height: 80, channels: 3, background: '#55aa77' },
    }).png().toBuffer();

    const result = await transformImageToWebp(
      new File([widePng], 'avatar.png'),
      { ...DEFAULT_OPTIONS, maxDimension: 72, fit: 'cover' },
    );

    expect(result.width).toBe(72);
    expect(result.height).toBe(72);
  });

  it('在读取解码前执行单图大小门禁，并允许恰好等于限制', async () => {
    const png = await sharp({
      create: { width: 32, height: 24, channels: 3, background: '#993355' },
    }).png().toBuffer();
    const file = new File([png], 'boundary.png');

    await expect(transformImageToWebp(file, {
      ...DEFAULT_OPTIONS,
      maxInputBytes: file.size - 1,
    })).rejects.toMatchObject({ code: ErrorCode.PARAM_ERROR } satisfies Partial<AppError>);

    const result = await transformImageToWebp(file, {
      ...DEFAULT_OPTIONS,
      maxInputBytes: file.size,
    });
    expect(result.mimeType).toBe('image/webp');
  });

  it('真实 HEIC 即使伪造文件名和 MIME 也能兜底转为 WebP', async () => {
    const fixture = Bun.file(join(process.cwd(), 'tests/fixtures/iphone.heic'));
    const source = await fixture.arrayBuffer();
    const disguised = new File([source], 'unknown.bin', { type: 'application/octet-stream' });

    const result = await transformImageToWebp(disguised, {
      ...DEFAULT_OPTIONS,
      maxDimension: 64,
    });
    const metadata = await sharp(result.data).metadata();

    expect(metadata.format).toBe('webp');
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
  });

  it('保留 animated WebP 的帧与延迟语义', async () => {
    const animated = await createAnimatedWebp();
    const result = await transformImageToWebp(
      new File([animated], 'animation.webp'),
      { ...DEFAULT_OPTIONS, maxDimension: 24 },
    );
    const metadata = await sharp(result.data, { animated: true, pages: -1 }).metadata();

    expect(metadata.format).toBe('webp');
    expect(metadata.pages).toBe(2);
    expect(metadata.delay).toEqual([120, 180]);
    expect(result.width).toBeLessThanOrEqual(24);
    expect(result.height).toBeLessThanOrEqual(24);
  });
});

async function createAnimatedWebp() {
  const width = 32;
  const pageHeight = 24;
  const channels = 4;
  const redFrame = Buffer.alloc(width * pageHeight * channels);
  const blueFrame = Buffer.alloc(width * pageHeight * channels);

  for (let offset = 0; offset < redFrame.length; offset += channels) {
    redFrame[offset] = 255;
    redFrame[offset + 3] = 255;
    blueFrame[offset + 2] = 255;
    blueFrame[offset + 3] = 255;
  }

  return sharp(Buffer.concat([redFrame, blueFrame]), {
    raw: {
      width,
      height: pageHeight * 2,
      channels,
      pageHeight,
    },
  }).webp({ loop: 0, delay: [120, 180] }).toBuffer();
}
