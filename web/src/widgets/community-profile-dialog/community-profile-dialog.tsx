/**
 * [INPUT]: 依赖社区资料查询/写入 hooks、头像裁切浏览器能力与 Treehole 弹层状态
 * [OUTPUT]: 对外提供 CommunityProfileDialog，统一编辑 Social 公共昵称与头像
 * [POS]: widgets/community-profile-dialog 的社区资料任务容器，由树洞与个人页共享装配
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import type { ChangeEvent, PointerEvent as ReactPointerEvent } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useToastStore } from '@/app/state/toast-store';
import { useUiStore } from '@/app/state/ui-store';
import {
  useClearCommunityAvatarMutation,
  useCommunityProfileQuery,
  useUpdateCommunityProfileMutation,
} from '@/entities/community/api/community-queries';
import { BottomSheet } from '@/shared/ui/bottom-sheet';
import { Button } from '@/shared/ui/button';
import { ActionMenu } from '@/shared/ui/action-menu';
import { ConfirmSheet } from '@/shared/ui/confirm-sheet';
import { TaskDialog } from '@/shared/ui/task-dialog';
import { CommunityAvatar } from '@/shared/ui/community-avatar';

const AVATAR_FILE_ACCEPT =
  'image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,image/avif,image/tiff,.jpg,.jpeg,.png,.webp,.gif,.heic,.heif,.avif,.tif,.tiff';
const CROP_VIEW_SIZE = 216;
const CROP_EXPORT_SIZE = 256;
const MIN_ZOOM = 1;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.01;
const NICKNAME_MIN_LENGTH = 2;
const NICKNAME_MAX_LENGTH = 12;
const RESERVED_NICKNAMES = new Set(['管理员', '官方', '系统', '匿名用户']);

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

function validateNickname(value: string) {
  const nickname = value.trim();
  if (!nickname) return null;
  const length = Array.from(nickname).length;
  if (length < NICKNAME_MIN_LENGTH || length > NICKNAME_MAX_LENGTH) {
    return `昵称长度必须为 ${NICKNAME_MIN_LENGTH}-${NICKNAME_MAX_LENGTH} 个字符`;
  }
  if (/[\p{C}\p{Zl}\p{Zp}]/u.test(nickname)) return '昵称不能包含控制字符或换行';
  if (RESERVED_NICKNAMES.has(nickname)) return '该昵称不可使用';
  return null;
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

  const baseName = source.name.replace(/\.[^/.]+$/, '') || 'community-avatar';
  const extension = blob.type === 'image/png' ? 'png' : 'webp';
  return new File([blob], `${baseName}.${extension}`, { type: blob.type });
}

export function CommunityProfileDialog() {
  const profileDialogOpen = useUiStore((state) => state.communityProfileDialogOpen);
  const closeProfileDialog = useUiStore((state) => state.closeCommunityProfileDialog);
  const pushToast = useToastStore((state) => state.pushToast);
  const profileQuery = useCommunityProfileQuery({ enabled: profileDialogOpen });
  const updateProfileMutation = useUpdateCommunityProfileMutation();
  const deleteMutation = useClearCommunityAvatarMutation();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dragStateRef = useRef<DragState | null>(null);
  const [source, setSource] = useState<AvatarSource | null>(null);
  const [offset, setOffset] = useState<Point>(INITIAL_OFFSET);
  const [zoom, setZoom] = useState(MIN_ZOOM);
  const [nicknameDraft, setNicknameDraft] = useState('');
  const [nicknameError, setNicknameError] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const currentAvatarUrl = profileQuery.data?.avatarUrl ?? null;
  const currentNickname = profileQuery.data?.nickname ?? null;
  const busy = updateProfileMutation.isPending || deleteMutation.isPending;
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

  useEffect(() => {
    if (!profileDialogOpen) return;
    setNicknameDraft(currentNickname ?? '');
  }, [profileDialogOpen, currentNickname]);

  const resetImageDraft = () => {
    setSource(null);
    setOffset(INITIAL_OFFSET);
    setZoom(MIN_ZOOM);
    dragStateRef.current = null;
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  const closeSheet = () => {
    resetImageDraft();
    setNicknameDraft(currentNickname ?? '');
    setNicknameError(null);
    setDeleteConfirmOpen(false);
    closeProfileDialog();
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

  const handleSave = async () => {
    const nicknameError = validateNickname(nicknameDraft);
    if (nicknameError) {
      setNicknameError(nicknameError);
      return;
    }

    setNicknameError(null);
    try {
      const avatar = source ? await buildCroppedAvatarFile(source, zoom, offset) : undefined;
      await updateProfileMutation.mutateAsync({
        nickname: nicknameDraft,
        avatar,
      });
      closeSheet();
    } catch (error) {
      pushToast({
        title: error instanceof Error ? error.message : '资料保存失败，请稍后重试',
        variant: 'error',
      });
    }
  };

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync();
      resetImageDraft();
      setDeleteConfirmOpen(false);
    } catch (error) {
      pushToast({
        title: error instanceof Error ? error.message : '删除头像失败，请稍后重试',
        variant: 'error',
      });
    }
  };

  return (
    <>
      {source && cropFrame ? (
        <TaskDialog
          closeLabel="返回"
          open={profileDialogOpen}
          title="裁切头像"
          onClose={resetImageDraft}
          footer={(
            <Button disabled={busy} fullWidth size="lg" type="button" onClick={() => void handleSave()}>
              {updateProfileMutation.isPending ? '保存中…' : '保存'}
            </Button>
          )}
        >
          <div className="space-y-8">
            <div
              className="relative mx-auto h-[216px] w-[216px] overflow-hidden rounded-full bg-shell-strong ring-1 ring-line"
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
            <label className="block space-y-3">
              <span className="text-sm font-medium">缩放</span>
              <input
                className="w-full accent-ink"
                max={MAX_ZOOM}
                min={MIN_ZOOM}
                step={ZOOM_STEP}
                type="range"
                value={zoom}
                onChange={(event) => handleZoomChange(Number(event.target.value))}
              />
            </label>
          </div>
        </TaskDialog>
      ) : (
        <BottomSheet
          open={profileDialogOpen}
          closeLabel="编辑资料"
          contentClassName="space-y-5"
          onClose={closeSheet}
        >
          <div className="flex items-center justify-between gap-3">
            <p className="text-lg font-semibold">编辑资料</p>
            <div className="flex items-center gap-1">
              <ActionMenu
                items={[{
                  label: deleteMutation.isPending ? '删除中…' : '删除头像',
                  disabled: busy || !currentAvatarUrl,
                  tone: 'danger',
                  onSelect: () => setDeleteConfirmOpen(true),
                }]}
              />
              <Button size="xs" type="button" variant="ghost" onClick={closeSheet}>关闭</Button>
            </div>
          </div>

          {profileQuery.isError ? <p className="text-sm text-error">资料加载失败，请重试</p> : null}

          <div className="flex items-center gap-3">
            <CommunityAvatar className="size-14 rounded-full text-base" src={currentAvatarUrl} />
            <p className="min-w-0 truncate text-sm font-medium">{profileQuery.data?.displayName ?? '社区用户'}</p>
          </div>

          <div className="space-y-2">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
              <label className="block min-w-0 space-y-2">
                <span className="text-sm font-medium">昵称 <span className="font-normal text-muted">选填</span></span>
                <input
                  className="field-control"
                  disabled={busy}
                  type="text"
                  value={nicknameDraft}
                  onChange={(event) => {
                    if (Array.from(event.target.value.trim()).length <= NICKNAME_MAX_LENGTH) {
                      setNicknameDraft(event.target.value);
                    }
                    setNicknameError(null);
                  }}
                />
              </label>

              <label className="inline-flex h-[var(--control-height-lg)] shrink-0 cursor-pointer items-center rounded-[0.625rem] border border-line bg-white px-3 text-sm font-medium shadow-card hover:bg-tint-soft">
                更换头像
                <input
                  ref={inputRef}
                  accept={AVATAR_FILE_ACCEPT}
                  className="sr-only"
                  disabled={busy}
                  type="file"
                  onChange={(event) => void handleSelectFile(event)}
                />
              </label>
            </div>
            {nicknameError ? <p className="text-xs text-error">{nicknameError}</p> : null}
          </div>

          <Button
            disabled={busy || profileQuery.isLoading}
            fullWidth
            size="lg"
            type="button"
            onClick={() => void handleSave()}
          >
            {updateProfileMutation.isPending ? '保存中…' : '保存'}
          </Button>
        </BottomSheet>
      )}

      <ConfirmSheet
        busy={deleteMutation.isPending}
        confirmLabel="删除"
        description="删除后恢复默认头像。"
        open={deleteConfirmOpen}
        title="删除头像？"
        tone="danger"
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={() => void handleDelete()}
      />
    </>
  );
}
