/**
 * [INPUT]: 依赖 Discover 元数据/创建 hooks、React Hook Form、图片预览与发布弹层状态
 * [OUTPUT]: 对外提供 DiscoverComposeSheet，以可滚动弹窗提交好饭推荐
 * [POS]: widgets/discover-compose-sheet 的长表单容器，只显示必要校验与失败反馈
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { zodResolver } from '@hookform/resolvers/zod';
import { ImagePlus, X } from 'lucide-react';
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useUiStore } from '@/app/state/ui-store';
import { useCreateDiscoverPostMutation, useDiscoverMetaQuery } from '@/entities/discover/api/discover-queries';
import { createPostSchema, type CreatePostFormValues } from '@/features/discover-create-post/model/create-post-schema';
import { Button } from '@/shared/ui/button';
import { FilterChip } from '@/shared/ui/filter-chip';
import { IconButton } from '@/shared/ui/icon-button';
import { TaskDialog } from '@/shared/ui/task-dialog';

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

const DISCOVER_IMAGE_ACCEPT =
  'image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,image/avif,image/tiff,.jpg,.jpeg,.png,.webp,.gif,.heic,.heif,.avif,.tif,.tiff';

export function DiscoverComposeSheet() {
  const composeSheetOpen = useUiStore((state) => state.discoverComposeSheetOpen);
  const closeComposeSheet = useUiStore((state) => state.closeDiscoverComposeSheet);
  const metaQuery = useDiscoverMetaQuery();
  const createMutation = useCreateDiscoverPostMutation();
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [selectionError, setSelectionError] = useState<string | null>(null);
  const [activePreviewIndex, setActivePreviewIndex] = useState<number | null>(null);
  const [imageViewerRequested, setImageViewerRequested] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
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

  useEffect(() => {
    if (!composeSheetOpen || !metaQuery.data?.categories.length) return;
    reset({
      category: metaQuery.data.categories[0],
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
  }, [composeSheetOpen, metaQuery.data, reset]);

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

  return (
    <>
      <TaskDialog
        open={composeSheetOpen}
        presentation="modal"
        title="发布推荐"
        onClose={closeComposeSheet}
        footer={(
          <Button disabled={createMutation.isPending || metaQuery.isLoading} form={FORM_ID} fullWidth size="lg" type="submit">
            {createMutation.isPending ? '发布中…' : '发布'}
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
              <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-[0.625rem] border border-line bg-white px-3 text-sm font-medium shadow-card hover:bg-tint-soft">
                <ImagePlus aria-hidden="true" className="size-4" />
                添加图片
                <input
                  accept={DISCOVER_IMAGE_ACCEPT}
                  className="sr-only"
                  multiple
                  type="file"
                  onChange={(event) => {
                    const nextFiles = Array.from(event.target.files || []).slice(0, maxImages);
                    setSelectedFiles(nextFiles);
                    setSelectionError(null);
                    setActivePreviewIndex(null);
                  }}
                />
              </label>

              {previewUrls.length > 0 ? (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {previewUrls.map((item, itemIndex) => (
                    <div key={`${item.file.name}-${item.file.lastModified}`} className="relative overflow-hidden rounded-[0.625rem] border border-line bg-tint-soft">
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
            {createMutation.isError ? <p className="text-sm text-error">发布失败，请重试</p> : null}
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
