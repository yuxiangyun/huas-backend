/**
 * [INPUT]: 依赖 Discover 元数据/创建 hooks、React Hook Form、共享图片预处理、图片预览与发布弹层状态
 * [OUTPUT]: 对外提供 DiscoverComposeSheet，以失败保稿、元数据刷新不重置和 1MB 目标图提交好饭推荐
 * [POS]: widgets/discover-compose-sheet 的长表单容器，表单生命周期只跟随打开边沿而不跟随查询对象变化
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { zodResolver } from '@hookform/resolvers/zod';
import { ImagePlus, LoaderCircle, X } from 'lucide-react';
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useUiStore } from '@/app/state/ui-store';
import { useCreateDiscoverPostMutation, useDiscoverMetaQuery } from '@/entities/discover/api/discover-queries';
import { createPostSchema, type CreatePostFormValues } from '@/features/discover-create-post/model/create-post-schema';
import { Button } from '@/shared/ui/button';
import { FilterChip } from '@/shared/ui/filter-chip';
import { IconButton } from '@/shared/ui/icon-button';
import { TaskDialog } from '@/shared/ui/task-dialog';
import { prepareUploadImages, SOCIAL_IMAGE_ACCEPT } from '@/shared/lib/image-upload-processing';

const loadImageViewer = () => import('@/shared/ui/image-viewer');
const FORM_ID = 'discover-compose-form';

const LazyImageViewer = lazy(async () => {
  const module = await loadImageViewer();
  return { default: module.ImageViewer };
});

function parseCustomTags(raw: string | undefined) {
  return (raw || '')
    .split(/[\n,，]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

const DISCOVER_IMAGE_ACCEPT = SOCIAL_IMAGE_ACCEPT;
const MAX_DISCOVER_IMAGE_BYTES = 32 * 1024 * 1024;
const TARGET_DISCOVER_IMAGE_BYTES = 1024 * 1024;

export function DiscoverComposeSheet() {
  const composeSheetOpen = useUiStore((state) => state.discoverComposeSheetOpen);
  const closeComposeSheet = useUiStore((state) => state.closeDiscoverComposeSheet);
  const metaQuery = useDiscoverMetaQuery();
  const createMutation = useCreateDiscoverPostMutation();
  const resetCreateMutation = createMutation.reset;
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [activePreviewIndex, setActivePreviewIndex] = useState<number | null>(null);
  const [imageViewerRequested, setImageViewerRequested] = useState(false);
  const [processingImages, setProcessingImages] = useState(false);
  const previousOpenRef = useRef(false);
  const imagePreparationGenerationRef = useRef(0);

  const {
    register,
    handleSubmit,
    getValues,
    reset,
    setValue,
    formState: { errors },
  } = useForm<CreatePostFormValues>({
    resolver: zodResolver(createPostSchema),
    defaultValues: {
      category: '',
      title: '',
      storeName: '',
      priceText: '',
      content: '',
      customTags: '',
    },
  });

  const maxTags = metaQuery.data?.limits.maxTagsPerPost ?? 6;
  const maxImages = metaQuery.data?.limits.maxImagesPerPost ?? 9;
  const maxTitleLength = metaQuery.data?.limits.maxTitleLength ?? 80;
  const maxStoreNameLength = metaQuery.data?.limits.maxStoreNameLength ?? 32;
  const maxPriceTextLength = metaQuery.data?.limits.maxPriceTextLength ?? 20;
  const maxContentLength = metaQuery.data?.limits.maxContentLength ?? 400;
  const maxTagLength = metaQuery.data?.limits.maxTagLength ?? 12;

  useEffect(() => {
    const opened = composeSheetOpen && !previousOpenRef.current;
    previousOpenRef.current = composeSheetOpen;
    if (!opened) return;
    resetCreateMutation();
    reset({
      category: metaQuery.data?.categories[0] ?? '',
      title: '',
      storeName: '',
      priceText: '',
      content: '',
      customTags: '',
    });
    setSelectedTags([]);
    setSelectedFiles([]);
    setSelectionError(null);
    setActivePreviewIndex(null);
  }, [composeSheetOpen, metaQuery.data?.categories, reset, resetCreateMutation]);

  useEffect(() => () => {
    imagePreparationGenerationRef.current += 1;
  }, []);

  useEffect(() => {
    const firstCategory = metaQuery.data?.categories[0];
    if (!composeSheetOpen || !firstCategory || getValues('category')) return;
    setValue('category', firstCategory, { shouldDirty: false, shouldValidate: true });
  }, [composeSheetOpen, getValues, metaQuery.data?.categories, setValue]);

  useEffect(() => {
    if (activePreviewIndex === null) return;
    setImageViewerRequested(true);
    void loadImageViewer();
  }, [activePreviewIndex]);

  const previewUrls = useMemo(
    () => selectedFiles.map((file) => ({ file, url: URL.createObjectURL(file) })),
    [selectedFiles]
  );

  useEffect(() => () => {
    previewUrls.forEach((item) => URL.revokeObjectURL(item.url));
  }, [previewUrls]);

  const onSubmit = handleSubmit(async (values) => {
    const uniqueTags = Array.from(new Set([...selectedTags, ...parseCustomTags(values.customTags)]));
    if (uniqueTags.length === 0) {
      setSelectionError('请选择至少一个标签');
      return;
    }
    if (uniqueTags.length > maxTags) {
      setSelectionError(`标签不能超过 ${maxTags} 个`);
      return;
    }
    if (uniqueTags.some((tag) => Array.from(tag).length > maxTagLength)) {
      setSelectionError(`单个标签不能超过 ${maxTagLength} 个字`);
      return;
    }
    if (selectedFiles.length === 0) {
      setSelectionError('请添加至少一张图片');
      return;
    }

    setSelectionError(null);
    try {
      await createMutation.mutateAsync({
        category: values.category,
        title: values.title.trim(),
        storeName: values.storeName.trim() || undefined,
        priceText: values.priceText.trim() || undefined,
        content: values.content.trim(),
        tags: uniqueTags,
        images: selectedFiles,
      });
      imagePreparationGenerationRef.current += 1;
      closeComposeSheet();
    } catch {
      // mutation 状态在表单内提供可重试反馈。
    }
  });

  const previewItems = previewUrls.map((item, itemIndex) => ({
    src: item.url,
    alt: `${item.file.name} · 第 ${itemIndex + 1} 张预览`,
    key: `${item.file.name}-${item.file.lastModified}`,
  }));

  const handleClose = () => {
    if (createMutation.isPending) return;
    imagePreparationGenerationRef.current += 1;
    setProcessingImages(false);
    closeComposeSheet();
  };

  return (
    <>
      <TaskDialog
        open={composeSheetOpen}
        presentation="modal"
        title="发布推荐"
        onClose={handleClose}
        footer={(
          <Button disabled={createMutation.isPending || metaQuery.isLoading || processingImages} form={FORM_ID} fullWidth size="lg" type="submit">
            {createMutation.isPending ? '发布中…' : processingImages ? '处理图片中…' : '发布'}
          </Button>
        )}
      >
        {metaQuery.isError ? (
          <p className="rounded-[0.625rem] bg-error-soft px-3 py-2 text-sm text-error">加载失败，请重试</p>
        ) : null}

        {metaQuery.data ? (
          <form className="space-y-6" id={FORM_ID} onSubmit={onSubmit}>
            <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_9rem]">
              <label className="block space-y-2">
                <span className="text-sm font-medium">名称</span>
                <input className="field-control" maxLength={maxTitleLength} placeholder="红油牛肉粉" {...register('title')} />
                {errors.title ? <p className="text-xs text-error">{errors.title.message}</p> : null}
              </label>
              <label className="block space-y-2">
                <span className="text-sm font-medium">价格 <span className="font-normal text-muted">选填</span></span>
                <input className="field-control" maxLength={maxPriceTextLength} placeholder="12 元" {...register('priceText')} />
                {errors.priceText ? <p className="text-xs text-error">{errors.priceText.message}</p> : null}
              </label>
            </div>

            <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_10rem]">
              <label className="block space-y-2">
                <span className="text-sm font-medium">店名 <span className="font-normal text-muted">选填</span></span>
                <input className="field-control" maxLength={maxStoreNameLength} placeholder="一食堂二楼" {...register('storeName')} />
                {errors.storeName ? <p className="text-xs text-error">{errors.storeName.message}</p> : null}
              </label>
              <label className="block space-y-2">
                <span className="text-sm font-medium">分类</span>
                <select className="field-control" {...register('category')}>
                  {metaQuery.data.categories.map((category) => <option key={category} value={category}>{category}</option>)}
                </select>
                {errors.category ? <p className="text-xs text-error">{errors.category.message}</p> : null}
              </label>
            </div>

            <label className="block space-y-2">
              <span className="text-sm font-medium">推荐理由</span>
              <textarea className="field-control min-h-32 resize-y" maxLength={maxContentLength} placeholder="味道、分量、排队情况" {...register('content')} />
              {errors.content ? <p className="text-xs text-error">{errors.content.message}</p> : null}
            </label>

            <fieldset className="space-y-3 border-t border-line pt-5">
              <legend className="text-sm font-medium">标签</legend>
              <div className="flex flex-wrap gap-2">
                {metaQuery.data.commonTags.map((tag) => (
                  <FilterChip
                    key={tag}
                    selected={selectedTags.includes(tag)}
                    size="sm"
                    onClick={() => {
                      setSelectionError(null);
                      setSelectedTags((current) => current.includes(tag)
                        ? current.filter((item) => item !== tag)
                        : current.length >= maxTags ? current : [...current, tag]);
                    }}
                  >
                    {tag}
                  </FilterChip>
                ))}
              </div>
              <input className="field-control" placeholder="添加自定义标签" {...register('customTags')} />
            </fieldset>

            <fieldset className="space-y-3 border-t border-line pt-5">
              <legend className="text-sm font-medium">图片</legend>
              <p className="text-xs text-muted">上传顺序中的第一张图片将作为信息流主图。</p>
              <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-[0.625rem] border border-line bg-white px-3 text-sm font-medium shadow-card hover:bg-tint-soft">
                {processingImages ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : <ImagePlus aria-hidden="true" className="size-4" />}
                {processingImages ? '处理图片中' : '添加图片'}
                <input
                  accept={DISCOVER_IMAGE_ACCEPT}
                  className="sr-only"
                  disabled={processingImages || createMutation.isPending}
                  multiple
                  type="file"
                  onChange={(event) => {
                    const nextFiles = Array.from(event.target.files || []);
                    event.target.value = '';
                    if (nextFiles.length > maxImages) {
                      setSelectionError(`每条好饭最多添加 ${maxImages} 张图片`);
                      return;
                    }
                    const preparationGeneration = imagePreparationGenerationRef.current + 1;
                    imagePreparationGenerationRef.current = preparationGeneration;
                    setProcessingImages(true);
                    setSelectionError(null);
                    void prepareUploadImages(nextFiles, {
                      maxFiles: maxImages,
                      maxInputBytes: MAX_DISCOVER_IMAGE_BYTES,
                      maxTotalBytes: maxImages * TARGET_DISCOVER_IMAGE_BYTES,
                      maxPixels: 16_000_000,
                      maxOutputBytes: TARGET_DISCOVER_IMAGE_BYTES,
                      maxDimension: 2048,
                      quality: 0.82,
                    }).then((prepared) => {
                      if (imagePreparationGenerationRef.current !== preparationGeneration) return;
                      setSelectedFiles(prepared);
                      setActivePreviewIndex(null);
                    }).catch((error) => {
                      if (imagePreparationGenerationRef.current !== preparationGeneration) return;
                      setSelectionError(error instanceof Error ? error.message : '图片处理失败，请重新选择');
                    }).finally(() => {
                      if (imagePreparationGenerationRef.current === preparationGeneration) setProcessingImages(false);
                    });
                  }}
                />
              </label>

              {previewUrls.length > 0 ? (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {previewUrls.map((item, itemIndex) => (
                    <div key={`${item.file.name}-${item.file.lastModified}`} className="relative overflow-hidden rounded-[0.625rem] border border-line bg-tint-soft">
                      {itemIndex === 0 ? <span className="absolute left-1.5 top-1.5 z-10 rounded-full bg-black/70 px-2 py-1 text-[10px] font-medium text-white">主图</span> : null}
                      <button className="block w-full" type="button" onClick={() => setActivePreviewIndex(itemIndex)}>
                        <img alt={item.file.name} className="aspect-square w-full object-cover" src={item.url} />
                      </button>
                      <IconButton
                        className="absolute right-1 top-1 bg-black/70 text-white hover:bg-black"
                        icon={<X aria-hidden="true" className="size-3.5" />}
                        label="移除图片"
                        size="xs"
                        onClick={() => setSelectedFiles((current) => current.filter((_, index) => index !== itemIndex))}
                      />
                    </div>
                  ))}
                </div>
              ) : null}
            </fieldset>

            {selectionError ? <p className="text-sm text-error">{selectionError}</p> : null}
            {createMutation.isError ? <p className="text-sm text-error">{createMutation.error instanceof Error ? createMutation.error.message : '发布失败，请重试'}</p> : null}
          </form>
        ) : null}
      </TaskDialog>

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
