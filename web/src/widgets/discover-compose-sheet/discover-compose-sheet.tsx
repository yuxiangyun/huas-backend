import { AnimatePresence, motion } from 'motion/react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useToastStore } from '@/app/state/toast-store';
import { useUiStore } from '@/app/state/ui-store';
import { useCreateDiscoverPostMutation, useDiscoverMetaQuery } from '@/entities/discover/api/discover-queries';
import { createPostSchema, type CreatePostFormValues } from '@/features/discover-create-post/model/create-post-schema';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { ImageViewer } from '@/shared/ui/image-viewer';

function parseCustomTags(raw: string | undefined) {
  return (raw || '')
    .split(/[\n,，]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function DiscoverComposeSheet() {
  const composeSheetOpen = useUiStore((state) => state.composeSheetOpen);
  const closeComposeSheet = useUiStore((state) => state.closeComposeSheet);
  const pushToast = useToastStore((state) => state.pushToast);
  const metaQuery = useDiscoverMetaQuery();
  const createMutation = useCreateDiscoverPostMutation();
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [activePreviewIndex, setActivePreviewIndex] = useState<number | null>(null);

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
      customTags: '',
    },
  });

  const customTagsValue = watch('customTags');
  const customTags = parseCustomTags(customTagsValue);
  const maxTags = metaQuery.data?.limits.maxTagsPerPost ?? 6;
  const maxImages = metaQuery.data?.limits.maxImagesPerPost ?? 9;
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
      customTags: '',
    });
    setSelectedTags([]);
    setSelectedFiles([]);
    setActivePreviewIndex(null);
  }, [composeSheetOpen, metaQuery.data, reset]);

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

    if (uniqueTags.length === 0) {
      return;
    }

    if (selectedFiles.length === 0) {
      return;
    }

    await createMutation.mutateAsync({
      category: values.category,
      title: values.title?.trim(),
      tags: uniqueTags,
      images: selectedFiles,
    });

    pushToast({
      title: '发布成功',
      message: '这份好饭已经加入最新列表。',
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
    <AnimatePresence>
      {composeSheetOpen ? (
        <>
          <motion.button
            aria-label="关闭发帖面板"
            className="fixed inset-0 z-40 bg-black/15 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            type="button"
            onClick={closeComposeSheet}
          />
          <motion.div
            className="fixed inset-x-0 bottom-0 z-50 mx-auto max-w-[430px] px-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 320, damping: 30 }}
          >
            <Card className="space-y-4 rounded-[2rem] bg-card-strong p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-lg font-semibold text-ink">发布好饭</p>
                  <p className="text-sm text-muted">记录今天这顿，也给后来的人一点参考。</p>
                </div>
                <Button size="sm" type="button" variant="ghost" onClick={closeComposeSheet}>
                  关闭
                </Button>
              </div>

              {metaQuery.isLoading ? (
                <div className="rounded-[1.25rem] bg-white/75 p-4 text-sm text-muted">
                  正在准备发布选项...
                </div>
              ) : null}

              {metaQuery.isError ? (
                <div className="rounded-[1.25rem] bg-tint-soft p-4 text-sm leading-6 text-[#7e3925]">
                  {metaQuery.error instanceof Error ? metaQuery.error.message : '暂时无法加载发布选项'}
                </div>
              ) : null}

              {metaQuery.data ? (
                <form className="space-y-4" onSubmit={onSubmit}>
                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-ink">分类</span>
                    <select
                      className="h-12 w-full rounded-[1.25rem] border border-line bg-white/80 px-4 text-ink outline-none focus:border-transparent focus:ring-2 focus:ring-tint/20"
                      {...register('category')}
                    >
                      {metaQuery.data.categories.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                    {errors.category ? (
                      <p className="text-sm text-[#9e2e22]">{errors.category.message}</p>
                    ) : null}
                  </label>

                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-ink">标题</span>
                    <input
                      className="h-12 w-full rounded-[1.25rem] border border-line bg-white/80 px-4 text-ink outline-none focus:border-transparent focus:ring-2 focus:ring-tint/20"
                      maxLength={metaQuery.data.limits.maxTitleLength}
                      placeholder="一句话描述这份饭"
                      {...register('title')}
                    />
                    {errors.title ? (
                      <p className="text-sm text-[#9e2e22]">{errors.title.message}</p>
                    ) : null}
                  </label>

                  <div className="space-y-2">
                    <span className="text-sm font-medium text-ink">常用标签</span>
                    <div className="flex flex-wrap gap-2">
                      {metaQuery.data.commonTags.map((tag) => {
                        const active = selectedTags.includes(tag);
                        return (
                          <button
                            key={tag}
                            className={active
                              ? 'rounded-pill bg-tint px-4 py-2 text-sm text-white'
                              : 'rounded-pill bg-white/80 px-4 py-2 text-sm text-muted ring-1 ring-line'}
                            type="button"
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
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-xs text-muted">
                      已选 {selectedTags.length} / {maxTags}
                    </p>
                  </div>

                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-ink">自定义标签</span>
                    <textarea
                      className="min-h-24 w-full rounded-[1.25rem] border border-line bg-white/80 px-4 py-3 text-ink outline-none focus:border-transparent focus:ring-2 focus:ring-tint/20"
                      placeholder="用逗号或换行分隔。会和上面的常用标签合并。"
                      {...register('customTags')}
                    />
                  </label>

                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-ink">图片</span>
                    <input
                      accept="image/*"
                      className="block w-full text-sm text-muted"
                      multiple
                      type="file"
                      onChange={(event) => {
                        const nextFiles = Array.from(event.target.files || []);
                        setSelectedFiles(nextFiles.slice(0, maxImages));
                        setActivePreviewIndex(null);
                      }}
                    />
                    <p className="text-xs text-muted">
                      最多 {maxImages} 张，系统会自动优化图片质量。
                    </p>
                  </label>

                  {selectedFiles.length > 0 ? (
                    <div className="grid grid-cols-3 gap-3">
                      {previewUrls.map((item, itemIndex) => (
                        <button
                          key={`${item.file.name}-${item.file.lastModified}`}
                          className="overflow-hidden rounded-[1.2rem]"
                          type="button"
                          onClick={() => setActivePreviewIndex(itemIndex)}
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

                  {createMutation.isError ? (
                    <div className="rounded-[1.25rem] bg-tint-soft p-4 text-sm leading-6 text-[#7e3925]">
                      {createMutation.error instanceof Error ? createMutation.error.message : '发布失败'}
                    </div>
                  ) : null}

                  {selectedTags.length + customTags.length === 0 ? (
                    <div className="rounded-[1.25rem] bg-white/75 px-4 py-3 text-sm text-muted ring-1 ring-line">
                      请至少选择或输入一个标签。
                    </div>
                  ) : null}

                  {totalTagCount > maxTags ? (
                    <div className="rounded-[1.25rem] bg-tint-soft px-4 py-3 text-sm leading-6 text-[#7e3925]">
                      标签总数不能超过 {maxTags} 个，请删减后再发布。
                    </div>
                  ) : null}

                  {selectedFiles.length === 0 ? (
                    <div className="rounded-[1.25rem] bg-white/75 px-4 py-3 text-sm text-muted ring-1 ring-line">
                      请至少上传一张图片。
                    </div>
                  ) : null}

                  <Button
                    fullWidth
                    size="lg"
                    type="submit"
                    variant="secondary"
                    disabled={!canSubmit}
                  >
                    {createMutation.isPending ? '发布中...' : '发布'}
                  </Button>
                </form>
              ) : null}
            </Card>
          </motion.div>

          <ImageViewer
            index={activePreviewIndex}
            items={previewItems}
            onClose={() => setActivePreviewIndex(null)}
            onIndexChange={setActivePreviewIndex}
          />
        </>
      ) : null}
    </AnimatePresence>
  );
}
