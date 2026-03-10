import { zodResolver } from '@hookform/resolvers/zod';
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useToastStore } from '@/app/state/toast-store';
import { useUiStore } from '@/app/state/ui-store';
import { useCreateDiscoverPostMutation, useDiscoverMetaQuery } from '@/entities/discover/api/discover-queries';
import { createPostSchema, type CreatePostFormValues } from '@/features/discover-create-post/model/create-post-schema';
import { Button } from '@/shared/ui/button';
import { BottomSheet } from '@/shared/ui/bottom-sheet';
import { Card } from '@/shared/ui/card';
import { FilterChip } from '@/shared/ui/filter-chip';

const loadImageViewer = () => import('@/shared/ui/image-viewer');

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
  const pushToast = useToastStore((state) => state.pushToast);
  const metaQuery = useDiscoverMetaQuery();
  const createMutation = useCreateDiscoverPostMutation();
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [activePreviewIndex, setActivePreviewIndex] = useState<number | null>(null);
  const [imageViewerRequested, setImageViewerRequested] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    watch,
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

  const titleValue = watch('title');
  const contentValue = watch('content');
  const customTagsValue = watch('customTags');
  const customTags = parseCustomTags(customTagsValue);
  const maxTags = metaQuery.data?.limits.maxTagsPerPost ?? 6;
  const maxImages = metaQuery.data?.limits.maxImagesPerPost ?? 9;
  const maxTitleLength = metaQuery.data?.limits.maxTitleLength ?? 80;
  const maxStoreNameLength = metaQuery.data?.limits.maxStoreNameLength ?? 32;
  const maxPriceTextLength = metaQuery.data?.limits.maxPriceTextLength ?? 20;
  const maxContentLength = metaQuery.data?.limits.maxContentLength ?? 400;
  const totalTagCount = Array.from(new Set([...selectedTags, ...customTags])).length;
  const canSubmit =
    totalTagCount > 0
    && totalTagCount <= maxTags
    && selectedFiles.length > 0
    && !createMutation.isPending;

  useEffect(() => {
    if (!composeSheetOpen) return;
    if (!metaQuery.data?.categories.length) return;

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

  useEffect(() => {
    return () => {
      previewUrls.forEach((item) => URL.revokeObjectURL(item.url));
    };
  }, [previewUrls]);

  const onSubmit = handleSubmit(async (values) => {
    const uniqueTags = Array.from(new Set([...selectedTags, ...parseCustomTags(values.customTags)]))
      .slice(0, maxTags);

    if (uniqueTags.length === 0 || selectedFiles.length === 0) {
      return;
    }

    await createMutation.mutateAsync({
      category: values.category,
      title: values.title.trim(),
      storeName: values.storeName.trim() || undefined,
      priceText: values.priceText.trim() || undefined,
      content: values.content.trim(),
      tags: uniqueTags,
      images: selectedFiles,
    });

    pushToast({
      title: '发布成功',
      variant: 'success',
    });
    closeComposeSheet();
  });

  const previewItems = previewUrls.map((item, itemIndex) => ({
    src: item.url,
    alt: `${item.file.name} · 第 ${itemIndex + 1} 张预览`,
    key: `${item.file.name}-${item.file.lastModified}`,
  }));

  return (
    <>
      <BottomSheet
        open={composeSheetOpen}
        closeLabel="关闭发帖面板"
        contentClassName="space-y-4"
        onClose={closeComposeSheet}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-lg font-semibold text-ink">发布好饭</p>
            <p className="text-sm leading-6 text-muted">
              填完就发
            </p>
          </div>
          <Button size="xs" type="button" variant="subtle" onClick={closeComposeSheet}>
            关闭
          </Button>
        </div>

        {metaQuery.isLoading ? (
          <div className="rounded-[1.05rem] bg-white/75 p-4 text-sm text-muted">
            正在准备发布选项...
          </div>
        ) : null}

        {metaQuery.isError ? (
          <div className="rounded-[1.05rem] bg-error-soft p-4 text-sm leading-6 text-error">
            {metaQuery.error instanceof Error ? metaQuery.error.message : '暂时无法加载发布选项'}
          </div>
        ) : null}

        {metaQuery.data ? (
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_10rem]">
              <label className="block space-y-2">
                <span className="text-sm font-medium text-ink">这顿饭叫什么</span>
                <input
                  className="h-11 w-full rounded-[1.05rem] border border-line bg-white/80 px-3.5 text-ink outline-none focus:border-transparent focus:ring-2 focus:ring-tint/20"
                  maxLength={maxTitleLength}
                  placeholder="例如：红油牛肉粉 / 脆皮鸡排饭"
                  {...register('title')}
                />
                <div className="flex items-center justify-between gap-3 text-xs text-muted">
                  <span>{errors.title?.message || '写菜名或套餐名'}</span>
                  <span>{titleValue.length} / {maxTitleLength}</span>
                </div>
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-medium text-ink">价格</span>
                <input
                  className="h-11 w-full rounded-[1.05rem] border border-line bg-white/80 px-3.5 text-ink outline-none focus:border-transparent focus:ring-2 focus:ring-tint/20"
                  maxLength={maxPriceTextLength}
                  placeholder="12元"
                  {...register('priceText')}
                />
                <div className="flex items-center justify-end text-xs text-muted">
                  <span>{watch('priceText').length} / {maxPriceTextLength}</span>
                </div>
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
              <label className="block space-y-2">
                <span className="text-sm font-medium text-ink">档口 / 店名</span>
                <input
                  className="h-11 w-full rounded-[1.05rem] border border-line bg-white/80 px-3.5 text-ink outline-none focus:border-transparent focus:ring-2 focus:ring-tint/20"
                  maxLength={maxStoreNameLength}
                  placeholder="例如：二楼川味档 / 校外老友粉"
                  {...register('storeName')}
                />
                <div className="flex items-center justify-between gap-3 text-xs text-muted">
                  <span>{errors.storeName?.message || '写档口或店名'}</span>
                  <span>{watch('storeName').length} / {maxStoreNameLength}</span>
                </div>
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-medium text-ink">分类</span>
                <select
                  className="h-11 w-full rounded-[1.05rem] border border-line bg-white/80 px-3.5 text-ink outline-none focus:border-transparent focus:ring-2 focus:ring-tint/20"
                  {...register('category')}
                >
                  {metaQuery.data.categories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
                {errors.category ? (
                  <p className="text-xs text-error">{errors.category.message}</p>
                ) : (
                  <p className="text-xs text-muted">选分类</p>
                )}
              </label>
            </div>

            <label className="block space-y-2">
              <span className="text-sm font-medium text-ink">推荐说明</span>
              <textarea
                className="min-h-28 w-full rounded-[1.05rem] border border-line bg-white/80 px-3.5 py-3 text-ink outline-none focus:border-transparent focus:ring-2 focus:ring-tint/20"
                maxLength={maxContentLength}
                placeholder="写味道、分量、排队情况"
                {...register('content')}
              />
              <div className="flex items-center justify-between gap-3 text-xs text-muted">
                <span>{errors.content?.message || '至少 10 个字'}</span>
                <span>{contentValue.length} / {maxContentLength}</span>
              </div>
            </label>

            <Card className="space-y-3 bg-white/70 shadow-none">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-ink">标签</p>
                <p className="text-sm leading-6 text-muted">
                  可选常用标签
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {metaQuery.data.commonTags.map((tag) => (
                  <FilterChip
                    key={tag}
                    selected={selectedTags.includes(tag)}
                    size="md"
                    onClick={() =>
                      setSelectedTags((current) =>
                        current.includes(tag)
                          ? current.filter((item) => item !== tag)
                          : current.length >= maxTags
                            ? current
                            : [...current, tag]
                      )
                    }
                  >
                    {tag}
                  </FilterChip>
                ))}
              </div>

              <label className="block space-y-2">
                <span className="text-sm font-medium text-ink">补充标签</span>
                <textarea
                  className="min-h-24 w-full rounded-[1.05rem] border border-line bg-white/80 px-3.5 py-3 text-ink outline-none focus:border-transparent focus:ring-2 focus:ring-tint/20"
                  placeholder="用逗号或换行分隔"
                  {...register('customTags')}
                />
              </label>

              <p className="text-xs text-muted">
                总计 {totalTagCount} / {maxTags} 个标签
              </p>
            </Card>

            <Card className="space-y-3 bg-white/70 shadow-none">
              <div className="space-y-1">
                <p className="text-sm font-semibold text-ink">图片</p>
                <p className="text-sm leading-6 text-muted">
                  至少上传一张
                </p>
              </div>

              <label className="block space-y-2">
                <input
                  accept={DISCOVER_IMAGE_ACCEPT}
                  className="block w-full text-sm text-muted file:mr-4 file:rounded-pill file:border-0 file:bg-ink file:px-4 file:py-2 file:text-sm file:font-medium file:text-white"
                  multiple
                  type="file"
                  onChange={(event) => {
                    const nextFiles = Array.from(event.target.files || []);
                    setSelectedFiles(nextFiles.slice(0, maxImages));
                    setActivePreviewIndex(null);
                  }}
                />
                <p className="text-xs text-muted">
                  最多 {maxImages} 张，支持 JPG、PNG、WebP、GIF、HEIC、HEIF、AVIF、TIFF，动图会保留动画
                </p>
              </label>

              {selectedFiles.length > 0 ? (
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                  {previewUrls.map((item, itemIndex) => (
                    <button
                      key={`${item.file.name}-${item.file.lastModified}`}
                      className="overflow-hidden rounded-[1.2rem]"
                      type="button"
                      onClick={() => {
                        setImageViewerRequested(true);
                        void loadImageViewer();
                        setActivePreviewIndex(itemIndex);
                      }}
                    >
                      <img
                        alt={item.file.name}
                        className="aspect-[3/4] w-full object-cover"
                        src={item.url}
                      />
                    </button>
                  ))}
                </div>
              ) : null}
            </Card>

            {createMutation.isError ? (
              <div className="rounded-[1.05rem] bg-error-soft p-4 text-sm leading-6 text-error">
                {createMutation.error instanceof Error ? createMutation.error.message : '发布失败'}
              </div>
            ) : null}

            {totalTagCount === 0 ? (
              <div className="rounded-[1.05rem] bg-white/75 px-4 py-3 text-sm text-muted ring-1 ring-line">
                请至少选择或输入一个标签
              </div>
            ) : null}

            {totalTagCount > maxTags ? (
              <div className="rounded-[1.05rem] bg-error-soft px-4 py-3 text-sm leading-6 text-error">
                标签总数不能超过 {maxTags} 个，请删减后再发布
              </div>
            ) : null}

            {selectedFiles.length === 0 ? (
              <div className="rounded-[1.05rem] bg-white/75 px-4 py-3 text-sm text-muted ring-1 ring-line">
                请至少上传一张图片
              </div>
            ) : null}

            <div className="flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm leading-6 text-muted">
                确认后发布
              </p>
              <Button
                className="sm:min-w-[9rem]"
                size="md"
                type="submit"
                disabled={!canSubmit}
              >
                {createMutation.isPending ? '发布中...' : '发布'}
              </Button>
            </div>
          </form>
        ) : null}
      </BottomSheet>

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
