/**
 * [INPUT]: 依赖 Treehole 服务端上传限制/multipart mutation、图片顺序预处理、表单校验与发布弹层状态
 * [OUTPUT]: 对外提供 TreeholeComposeSheet，以移动全屏编辑器完成文字、多图预览、失败保稿与放弃确认
 * [POS]: widgets/treehole-compose-sheet 的图文发布任务容器，图片顺序即服务端顺序且首张明确成为首页首图
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { zodResolver } from '@hookform/resolvers/zod';
import { ImagePlus, LoaderCircle, X } from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useUiStore } from '@/app/state/ui-store';
import { useCreateTreeholePostMutation, useTreeholeMetaQuery } from '@/entities/treehole/api/treehole-queries';
import type { TreeholeMeta } from '@/entities/treehole/model/treehole-types';
import { createTreeholePostSchema, type CreateTreeholePostFormValues } from '@/features/treehole-create-post/model/create-treehole-post-schema';
import {
  formatBytes,
  prepareTreeholeImages,
  TREEHOLE_IMAGE_ACCEPT,
} from '@/features/treehole-create-post/model/treehole-image-processing';
import { Button } from '@/shared/ui/button';
import { ConfirmSheet } from '@/shared/ui/confirm-sheet';
import { IconButton } from '@/shared/ui/icon-button';
import { TaskDialog } from '@/shared/ui/task-dialog';

const loadImageViewer = () => import('@/shared/ui/image-viewer');
const LazyImageViewer = lazy(async () => {
  const module = await loadImageViewer();
  return { default: module.ImageViewer };
});

const FORM_ID = 'treehole-compose-form';

interface ImageDraft {
  id: string;
  sourceKey: string;
  file: File;
  previewUrl: string;
}

function sourceKey(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function imageDraftId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function hasUsableImageLimits(
  limits: TreeholeMeta['limits'] | undefined
): limits is TreeholeMeta['limits'] {
  return Boolean(
    limits
      && Number.isSafeInteger(limits.maxImagesPerPost)
      && limits.maxImagesPerPost > 0
      && Number.isFinite(limits.maxImageBytes)
      && limits.maxImageBytes > 0
      && Number.isFinite(limits.maxImageTotalBytes)
      && limits.maxImageTotalBytes > 0
      && Number.isFinite(limits.maxImagePixels)
      && limits.maxImagePixels > 0
      && Number.isFinite(limits.maxOutputImageBytes)
      && limits.maxOutputImageBytes > 0
      && Number.isFinite(limits.imageMaxDimension)
      && limits.imageMaxDimension > 0
      && Number.isFinite(limits.imageQuality)
      && limits.imageQuality > 0
  );
}

export function TreeholeComposeSheet() {
  const composeSheetOpen = useUiStore((state) => state.treeholeComposeSheetOpen);
  const closeComposeSheet = useUiStore((state) => state.closeTreeholeComposeSheet);
  const metaQuery = useTreeholeMetaQuery();
  const createMutation = useCreateTreeholePostMutation();
  const resetCreateMutation = createMutation.reset;
  const imagesRef = useRef<ImageDraft[]>([]);
  const processingImagesRef = useRef(false);
  const previousOpenRef = useRef(false);
  const [images, setImages] = useState<ImageDraft[]>([]);
  const [queuedSourceFiles, setQueuedSourceFiles] = useState<File[]>([]);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [processingImages, setProcessingImages] = useState(false);
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  const [activePreviewIndex, setActivePreviewIndex] = useState<number | null>(null);
  const [imageViewerRequested, setImageViewerRequested] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    setError,
    watch,
    formState: { errors },
  } = useForm<CreateTreeholePostFormValues>({
    resolver: zodResolver(createTreeholePostSchema),
    defaultValues: { content: '' },
  });
  const content = watch('content');
  const limits = metaQuery.data?.limits;
  const imageLimits = hasUsableImageLimits(limits) ? limits : null;
  const hasDraft = content.trim().length > 0 || images.length > 0 || queuedSourceFiles.length > 0;
  const selectedBytes = images.reduce((total, image) => total + image.file.size, 0);

  useEffect(() => {
    const opened = composeSheetOpen && !previousOpenRef.current;
    previousOpenRef.current = composeSheetOpen;
    if (opened) resetCreateMutation();
  }, [composeSheetOpen, resetCreateMutation]);

  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  useEffect(() => () => {
    imagesRef.current.forEach((image) => URL.revokeObjectURL(image.previewUrl));
  }, []);

  useEffect(() => {
    if (activePreviewIndex === null) return;
    setImageViewerRequested(true);
    void loadImageViewer();
  }, [activePreviewIndex]);

  const clearDraft = () => {
    setImages((current) => {
      current.forEach((image) => URL.revokeObjectURL(image.previewUrl));
      imagesRef.current = [];
      return [];
    });
    reset({ content: '' });
    setQueuedSourceFiles([]);
    setSelectionError(null);
    setActivePreviewIndex(null);
  };

  const requestClose = () => {
    if (createMutation.isPending || processingImages) return;
    if (hasDraft) {
      setDiscardConfirmOpen(true);
      return;
    }
    closeComposeSheet();
  };

  const removeImage = (imageId: string) => {
    setImages((current) => {
      const removed = current.find((image) => image.id === imageId);
      if (removed) URL.revokeObjectURL(removed.previewUrl);
      const nextImages = current.filter((image) => image.id !== imageId);
      imagesRef.current = nextImages;
      return nextImages;
    });
    setSelectionError(null);
    setActivePreviewIndex(null);
  };

  const appendImages = useCallback(async (sourceFiles: File[]) => {
    if (sourceFiles.length === 0) return;
    if (!imageLimits) {
      setSelectionError('发布规则尚未加载，请稍后重试');
      return;
    }
    if (processingImagesRef.current) return;

    const currentImages = imagesRef.current;
    const existingKeys = new Set(currentImages.map((image) => image.sourceKey));
    const uniqueSourceFiles = sourceFiles.filter((file) => {
      const key = sourceKey(file);
      if (existingKeys.has(key)) return false;
      existingKeys.add(key);
      return true;
    });
    if (uniqueSourceFiles.length === 0) {
      setSelectionError('这些图片已经添加过了');
      return;
    }
    if (currentImages.length + uniqueSourceFiles.length > imageLimits.maxImagesPerPost) {
      setSelectionError(`每篇帖子最多添加 ${imageLimits.maxImagesPerPost} 张图片`);
      return;
    }

    processingImagesRef.current = true;
    setProcessingImages(true);
    setSelectionError(null);
    try {
      const preparedFiles = await prepareTreeholeImages(uniqueSourceFiles, imageLimits);
      const currentBytes = imagesRef.current.reduce((total, image) => total + image.file.size, 0);
      const nextTotalBytes = currentBytes + preparedFiles.reduce((total, file) => total + file.size, 0);
      if (nextTotalBytes > imageLimits.maxImageTotalBytes) {
        throw new Error(`全部图片不能超过 ${formatBytes(imageLimits.maxImageTotalBytes)}`);
      }
      setImages((current) => {
        const nextImages = [
          ...current,
          ...preparedFiles.map((file, index) => ({
          id: imageDraftId(),
          sourceKey: sourceKey(uniqueSourceFiles[index]),
          file,
          previewUrl: URL.createObjectURL(file),
          })),
        ];
        imagesRef.current = nextImages;
        return nextImages;
      });
    } catch (error) {
      setSelectionError(error instanceof Error ? error.message : '图片处理失败，请重新选择');
    } finally {
      processingImagesRef.current = false;
      setProcessingImages(false);
    }
  }, [imageLimits]);

  useEffect(() => {
    if (!imageLimits || processingImagesRef.current || queuedSourceFiles.length === 0) return;
    const pendingFiles = queuedSourceFiles;
    setQueuedSourceFiles([]);
    void appendImages(pendingFiles);
  }, [appendImages, imageLimits, queuedSourceFiles]);

  const onSubmit = handleSubmit(async (values) => {
    if (!limits) return;
    if (values.content.trim().length > limits.maxPostLength) {
      setError('content', { message: `内容不能超过 ${limits.maxPostLength} 个字` });
      return;
    }
    try {
      await createMutation.mutateAsync({
        content: values.content.trim(),
        images: images.map((image) => image.file),
      });
      clearDraft();
      closeComposeSheet();
    } catch {
      // 保留完整草稿，mutation 状态在表单内提供可重试反馈。
    }
  });

  const previewItems = images.map((image, imageIndex) => ({
    src: image.previewUrl,
    alt: `第 ${imageIndex + 1} 张图片预览`,
    key: image.id,
  }));

  return (
    <>
      <TaskDialog
        className="max-w-[40rem]"
        contentClassName="sm:px-6"
        open={composeSheetOpen}
        title="发布动态"
        onClose={requestClose}
        footer={(
          <Button
            disabled={createMutation.isPending || processingImages || queuedSourceFiles.length > 0 || !metaQuery.data}
            form={FORM_ID}
            fullWidth
            size="lg"
            type="submit"
          >
            {createMutation.isPending ? '发布中…' : processingImages ? '处理图片中…' : metaQuery.isLoading ? '加载发布规则…' : '发布'}
          </Button>
        )}
      >
        <form className="space-y-6" id={FORM_ID} onSubmit={onSubmit}>
          <label className="block space-y-2">
            <span className="sr-only">内容</span>
            <textarea
              autoFocus
              className="field-control min-h-48 resize-none border-0 px-0 py-0 text-base leading-7 shadow-none focus:shadow-none sm:min-h-56"
              maxLength={limits?.maxPostLength}
              placeholder="分享此刻的想法"
              {...register('content')}
            />
            <span className="flex items-center justify-between gap-3 text-xs text-muted">
              <span>正文为必填内容</span>
              <span>{content.length}/{limits?.maxPostLength ?? '—'}</span>
            </span>
            {errors.content ? <p className="text-sm text-error">{errors.content.message}</p> : null}
          </label>

          <section className="space-y-3 border-t border-line pt-5" aria-labelledby="treehole-images-label">
            <div className="flex items-end justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold" id="treehole-images-label">图片</h3>
                <p className="mt-1 text-xs leading-5 text-muted">第一张是首页首图，选择顺序就是详情浏览顺序。</p>
              </div>
              <span className="shrink-0 text-xs text-muted">{images.length + queuedSourceFiles.length}/{limits?.maxImagesPerPost ?? '—'}</span>
            </div>

            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {images.map((image, imageIndex) => (
                <div key={image.id} className="relative overflow-hidden rounded-[0.75rem] border border-line bg-tint-soft">
                  {imageIndex === 0 ? (
                    <span className="absolute left-1.5 top-1.5 z-10 rounded-full bg-black/70 px-2 py-1 text-[10px] font-semibold text-white">首图</span>
                  ) : (
                    <span className="absolute left-1.5 top-1.5 z-10 rounded-full bg-black/55 px-2 py-1 text-[10px] font-medium text-white">{imageIndex + 1}</span>
                  )}
                  <button className="block w-full" type="button" onClick={() => setActivePreviewIndex(imageIndex)}>
                    <img alt={`第 ${imageIndex + 1} 张图片`} className="aspect-square w-full object-cover" src={image.previewUrl} />
                  </button>
                  <IconButton
                    className="absolute right-1 top-1 rounded-full bg-black/70 text-white shadow-none hover:bg-black"
                    icon={<X aria-hidden="true" className="size-3.5" />}
                    label={`移除第 ${imageIndex + 1} 张图片`}
                    size="xs"
                    onClick={() => removeImage(image.id)}
                  />
                </div>
              ))}

              {!imageLimits || images.length < imageLimits.maxImagesPerPost ? (
                <label className="relative grid aspect-square cursor-pointer place-items-center overflow-hidden rounded-[0.75rem] border border-dashed border-line bg-white text-muted transition-colors hover:border-ink hover:text-ink">
                  <span className="pointer-events-none flex flex-col items-center gap-2 text-xs font-medium">
                    {processingImages ? <LoaderCircle aria-hidden="true" className="size-6 animate-spin" /> : <ImagePlus aria-hidden="true" className="size-6" />}
                    {processingImages ? '处理中' : '添加图片'}
                  </span>
                  <input
                    accept={TREEHOLE_IMAGE_ACCEPT}
                    aria-label="选择要发布的图片"
                    className="absolute inset-0 z-10 size-full cursor-pointer opacity-0 disabled:cursor-wait"
                    disabled={processingImages || createMutation.isPending}
                    multiple
                    type="file"
                    onChange={(event) => {
                      const files = Array.from(event.currentTarget.files ?? []);
                      event.currentTarget.value = '';
                      if (imageLimits) {
                        void appendImages(files);
                      } else {
                        setQueuedSourceFiles((current) => [...current, ...files]);
                      }
                    }}
                  />
                </label>
              ) : null}
            </div>

            {queuedSourceFiles.length > 0 ? (
              <div className="flex items-center justify-between gap-3 text-xs text-muted" aria-live="polite">
                <span className="inline-flex items-center gap-2">
                  <LoaderCircle aria-hidden="true" className="size-3.5 animate-spin" />
                  已选择 {queuedSourceFiles.length} 张图片，发布规则加载后将自动处理
                </span>
                <button className="shrink-0 font-medium text-ink hover:opacity-60" type="button" onClick={() => setQueuedSourceFiles([])}>取消选择</button>
              </div>
            ) : null}

            {images.length > 0 && imageLimits ? (
              <p className="text-xs text-muted">
                已处理 {formatBytes(selectedBytes)}，上限 {formatBytes(imageLimits.maxImageTotalBytes)}
              </p>
            ) : null}
          </section>

          {metaQuery.isError ? (
            <div className="flex items-center justify-between gap-3 rounded-[0.75rem] bg-error-soft px-3 py-2.5">
              <p className="text-sm text-error">发布规则加载失败</p>
              <Button size="xs" type="button" variant="ghost" onClick={() => void metaQuery.refetch()}>重试</Button>
            </div>
          ) : null}
          {metaQuery.isSuccess && !imageLimits ? (
            <div className="flex items-center justify-between gap-3 rounded-[0.75rem] bg-error-soft px-3 py-2.5">
              <p className="text-sm text-error">图片发布规则不完整</p>
              <Button size="xs" type="button" variant="ghost" onClick={() => void metaQuery.refetch()}>重试</Button>
            </div>
          ) : null}
          {selectionError ? <p className="text-sm text-error">{selectionError}</p> : null}
          {createMutation.isError ? (
            <p className="rounded-[0.75rem] bg-error-soft px-3 py-2.5 text-sm leading-6 text-error">
              {createMutation.error instanceof Error ? createMutation.error.message : '发布失败，请重试'}
            </p>
          ) : null}
        </form>
      </TaskDialog>

      <ConfirmSheet
        busy={false}
        confirmLabel="放弃"
        description="文字和已选择的图片将被清除。"
        open={discardConfirmOpen}
        title="放弃这篇动态？"
        tone="danger"
        onClose={() => setDiscardConfirmOpen(false)}
        onConfirm={() => {
          clearDraft();
          setDiscardConfirmOpen(false);
          closeComposeSheet();
        }}
      />

      {imageViewerRequested ? (
        <Suspense fallback={null}>
          <LazyImageViewer
            index={activePreviewIndex}
            items={previewItems}
            onClose={() => setActivePreviewIndex(null)}
            onIndexChange={setActivePreviewIndex}
          />
        </Suspense>
      ) : null}
    </>
  );
}
