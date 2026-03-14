import type { ChangeEvent, PointerEvent as ReactPointerEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useToastStore } from '@/app/state/toast-store';
import { useUiStore } from '@/app/state/ui-store';
import {
  useDeleteTreeholeAvatarMutation,
  useTreeholeAvatarQuery,
  useUploadTreeholeAvatarMutation,
} from '@/entities/treehole/api/treehole-queries';
import { BottomSheet } from '@/shared/ui/bottom-sheet';
import { Button } from '@/shared/ui/button';
import { TreeholeAvatar } from '@/shared/ui/treehole-avatar';

const AVATAR_FILE_ACCEPT =
  'image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,image/avif,image/tiff,.jpg,.jpeg,.png,.webp,.gif,.heic,.heif,.avif,.tif,.tiff';
const CROP_VIEW_SIZE = 216;
const CROP_EXPORT_SIZE = 256;
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.01;

interface Point {
  x: number;
  y: number;
}

interface AvatarSource {
  url: string;
  name: string;
  mimeType: string;
  width: number;
  height: number;
}

interface CropFrame {
  width: number;
  height: number;
  left: number;
  top: number;
  clampedOffset: Point;
}

interface DragState {
  pointerId: number;
  originOffset: Point;
  startX: number;
  startY: number;
}

const INITIAL_OFFSET: Point = { x: 0, y: 0 };

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function computeCropFrame(source: AvatarSource, zoom: number, offset: Point): CropFrame {
  const baseScale = Math.max(CROP_VIEW_SIZE / source.width, CROP_VIEW_SIZE / source.height);
  const displayScale = baseScale * zoom;
  const width = source.width * displayScale;
  const height = source.height * displayScale;
  const maxX = Math.max(0, (width - CROP_VIEW_SIZE) / 2);
  const maxY = Math.max(0, (height - CROP_VIEW_SIZE) / 2);
  const clampedOffset: Point = {
    x: clamp(offset.x, -maxX, maxX),
    y: clamp(offset.y, -maxY, maxY),
  };

  return {
    width,
    height,
    left: (CROP_VIEW_SIZE - width) / 2 + clampedOffset.x,
    top: (CROP_VIEW_SIZE - height) / 2 + clampedOffset.y,
    clampedOffset,
  };
}

function readImageSize(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => {
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      reject(new Error('图片读取失败'));
    };
    image.src = url;
  });
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('图片读取失败'));
    image.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, type, quality);
  });
}

async function buildCroppedAvatarFile(source: AvatarSource, zoom: number, offset: Point) {
  const frame = computeCropFrame(source, zoom, offset);
  const image = await loadImage(source.url);
  const canvas = document.createElement('canvas');
  canvas.width = CROP_EXPORT_SIZE;
  canvas.height = CROP_EXPORT_SIZE;
  const context = canvas.getContext('2d');

  if (!context) {
    throw new Error('浏览器不支持图片裁切');
  }

  const drawScale = CROP_EXPORT_SIZE / CROP_VIEW_SIZE;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(
    image,
    frame.left * drawScale,
    frame.top * drawScale,
    frame.width * drawScale,
    frame.height * drawScale
  );

  const preferredType = source.mimeType === 'image/png' ? 'image/png' : 'image/webp';
  const firstBlob = await canvasToBlob(canvas, preferredType, 0.9);
  const blob = firstBlob || await canvasToBlob(canvas, 'image/png');
  if (!blob) {
    throw new Error('头像生成失败，请重试');
  }

  const baseName = source.name.replace(/\.[^/.]+$/, '') || 'treehole-avatar';
  const extension = blob.type === 'image/png' ? 'png' : 'webp';
  return new File([blob], `${baseName}.${extension}`, { type: blob.type });
}

export function TreeholeAvatarSheet() {
  const avatarSheetOpen = useUiStore((state) => state.treeholeAvatarSheetOpen);
  const closeAvatarSheet = useUiStore((state) => state.closeTreeholeAvatarSheet);
  const pushToast = useToastStore((state) => state.pushToast);
  const avatarQuery = useTreeholeAvatarQuery({ enabled: avatarSheetOpen });
  const uploadMutation = useUploadTreeholeAvatarMutation();
  const deleteMutation = useDeleteTreeholeAvatarMutation();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const [source, setSource] = useState<AvatarSource | null>(null);
  const [offset, setOffset] = useState<Point>(INITIAL_OFFSET);
  const [zoom, setZoom] = useState(MIN_ZOOM);

  const currentAvatarUrl = avatarQuery.data?.avatarUrl ?? null;
  const busy = uploadMutation.isPending || deleteMutation.isPending;
  const cropFrame = useMemo(
    () => (source ? computeCropFrame(source, zoom, offset) : null),
    [source, zoom, offset]
  );

  useEffect(() => {
    if (!source) return undefined;
    return () => {
      URL.revokeObjectURL(source.url);
    };
  }, [source]);

  const resetDraft = () => {
    setSource(null);
    setOffset(INITIAL_OFFSET);
    setZoom(MIN_ZOOM);
    dragStateRef.current = null;
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  const closeSheet = () => {
    resetDraft();
    closeAvatarSheet();
  };

  const handleSelectFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0];
    event.target.value = '';
    if (!selectedFile) return;

    if (selectedFile.type && !selectedFile.type.startsWith('image/')) {
      pushToast({
        title: '请选择图片文件',
        variant: 'error',
      });
      return;
    }

    const nextUrl = URL.createObjectURL(selectedFile);
    try {
      const size = await readImageSize(nextUrl);
      setSource({
        url: nextUrl,
        name: selectedFile.name,
        mimeType: selectedFile.type,
        width: size.width,
        height: size.height,
      });
      setOffset(INITIAL_OFFSET);
      setZoom(MIN_ZOOM);
    } catch {
      URL.revokeObjectURL(nextUrl);
      pushToast({
        title: '图片读取失败，请换一张后重试',
        variant: 'error',
      });
    }
  };

  const handleZoomChange = (nextZoom: number) => {
    if (!source) {
      setZoom(nextZoom);
      return;
    }
    const normalizedZoom = clamp(nextZoom, MIN_ZOOM, MAX_ZOOM);
    setZoom(normalizedZoom);
    setOffset((current) => computeCropFrame(source, normalizedZoom, current).clampedOffset);
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!source) return;
    event.preventDefault();
    dragStateRef.current = {
      pointerId: event.pointerId,
      originOffset: offset,
      startX: event.clientX,
      startY: event.clientY,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!source) return;
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) return;

    event.preventDefault();
    const nextOffset = {
      x: dragState.originOffset.x + (event.clientX - dragState.startX),
      y: dragState.originOffset.y + (event.clientY - dragState.startY),
    };
    setOffset(computeCropFrame(source, zoom, nextOffset).clampedOffset);
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (dragStateRef.current?.pointerId !== event.pointerId) return;
    dragStateRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleUpload = async () => {
    if (!source) {
      pushToast({
        title: '请先选择图片',
        variant: 'error',
      });
      return;
    }

    try {
      const croppedFile = await buildCroppedAvatarFile(source, zoom, offset);
      await uploadMutation.mutateAsync({ file: croppedFile });
      pushToast({
        title: '头像已更新',
        variant: 'success',
      });
      closeSheet();
    } catch (error) {
      pushToast({
        title: error instanceof Error ? error.message : '头像上传失败，请稍后重试',
        variant: 'error',
      });
    }
  };

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync();
      pushToast({
        title: '已恢复默认头像',
        variant: 'success',
      });
      resetDraft();
    } catch (error) {
      pushToast({
        title: error instanceof Error ? error.message : '删除头像失败，请稍后重试',
        variant: 'error',
      });
    }
  };

  return (
    <BottomSheet
      open={avatarSheetOpen}
      closeLabel="关闭树洞头像面板"
      contentClassName="space-y-4"
      onClose={closeSheet}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-lg font-semibold text-ink">树洞头像</p>
          <p className="text-sm leading-6 text-muted">
            仅用于树洞匿名标识
          </p>
        </div>
        <Button size="xs" type="button" variant="subtle" onClick={closeSheet}>
          关闭
        </Button>
      </div>

      {avatarQuery.isError ? (
        <div className="rounded-[1.05rem] bg-error-soft p-4 text-sm leading-6 text-error">
          {avatarQuery.error instanceof Error ? avatarQuery.error.message : '头像信息加载失败'}
        </div>
      ) : null}

      <div className="rounded-[1.2rem] bg-white/78 p-4 ring-1 ring-line">
        <div className="flex items-start gap-3">
          <TreeholeAvatar className="size-12 rounded-[0.95rem] text-base" src={currentAvatarUrl} />
          <div className="space-y-1">
            <p className="text-sm font-medium text-ink">当前头像</p>
            <p className="text-xs leading-5 text-muted">
              会显示在帖子和评论里
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <label className="inline-flex cursor-pointer items-center rounded-pill bg-white/84 px-4 py-2 text-sm font-medium text-ink ring-1 ring-line transition hover:bg-white active:bg-[#f3f4f6]">
          选择图片
          <input
            ref={inputRef}
            accept={AVATAR_FILE_ACCEPT}
            className="sr-only"
            disabled={busy}
            type="file"
            onChange={(event) => {
              void handleSelectFile(event);
            }}
          />
        </label>
        <p className="text-xs text-muted">
          上传后会按方形头像展示，可在下方拖动裁切
        </p>
      </div>

      {source && cropFrame ? (
        <div className="space-y-3 rounded-[1.2rem] bg-white/78 p-4 ring-1 ring-line">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-ink">裁切预览</p>
            <p className="text-xs leading-5 text-muted">
              拖动图片调整位置，缩放控制头像范围
            </p>
          </div>

          <div
            className="relative mx-auto h-[216px] w-[216px] overflow-hidden rounded-[1rem] bg-shell-strong ring-1 ring-line"
            style={{ touchAction: 'none' }}
            onPointerCancel={handlePointerUp}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          >
            <img
              alt="头像裁切预览"
              className="pointer-events-none absolute select-none"
              draggable={false}
              src={source.url}
              style={{
                left: `${cropFrame.left}px`,
                top: `${cropFrame.top}px`,
                width: `${cropFrame.width}px`,
                height: `${cropFrame.height}px`,
                maxWidth: 'none',
              }}
            />
          </div>

          <label className="block space-y-2">
            <div className="flex items-center justify-between text-xs text-muted">
              <span>缩放</span>
              <span>{Math.round(zoom * 100)}%</span>
            </div>
            <input
              className="w-full accent-ink"
              max={MAX_ZOOM}
              min={MIN_ZOOM}
              step={ZOOM_STEP}
              type="range"
              value={zoom}
              onChange={(event) => {
                handleZoomChange(Number(event.target.value));
              }}
            />
          </label>

          <div className="flex flex-col gap-2.5 sm:flex-row sm:justify-end">
            <Button
              className="sm:min-w-[6.5rem]"
              disabled={busy}
              size="sm"
              type="button"
              variant="subtle"
              onClick={resetDraft}
            >
              重新选择
            </Button>
            <Button
              className="sm:min-w-[6.5rem]"
              disabled={busy}
              size="sm"
              type="button"
              variant="secondary"
              onClick={() => void handleUpload()}
            >
              {uploadMutation.isPending ? '保存中...' : '保存头像'}
            </Button>
          </div>
        </div>
      ) : null}

      <div className="flex justify-end">
        <Button
          className="min-w-[6.5rem]"
          disabled={busy || !currentAvatarUrl}
          size="sm"
          type="button"
          variant="danger"
          onClick={() => void handleDelete()}
        >
          {deleteMutation.isPending ? '删除中...' : '删除头像'}
        </Button>
      </div>
    </BottomSheet>
  );
}
