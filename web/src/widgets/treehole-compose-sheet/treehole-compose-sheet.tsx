import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useToastStore } from '@/app/state/toast-store';
import { useUiStore } from '@/app/state/ui-store';
import { useCreateTreeholePostMutation, useTreeholeMetaQuery } from '@/entities/treehole/api/treehole-queries';
import {
  createTreeholePostSchema,
  type CreateTreeholePostFormValues,
} from '@/features/treehole-create-post/model/create-treehole-post-schema';
import { BottomSheet } from '@/shared/ui/bottom-sheet';
import { Button } from '@/shared/ui/button';

export function TreeholeComposeSheet() {
  const composeSheetOpen = useUiStore((state) => state.treeholeComposeSheetOpen);
  const closeComposeSheet = useUiStore((state) => state.closeTreeholeComposeSheet);
  const pushToast = useToastStore((state) => state.pushToast);
  const metaQuery = useTreeholeMetaQuery();
  const createMutation = useCreateTreeholePostMutation();
  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<CreateTreeholePostFormValues>({
    resolver: zodResolver(createTreeholePostSchema),
    defaultValues: {
      content: '',
    },
  });

  const contentValue = watch('content');
  const maxPostLength = metaQuery.data?.limits.maxPostLength ?? 500;

  useEffect(() => {
    if (!composeSheetOpen) return;
    reset({ content: '' });
  }, [composeSheetOpen, reset]);

  const onSubmit = handleSubmit(async (values) => {
    await createMutation.mutateAsync({ content: values.content.trim() });
    pushToast({
      title: '发布成功',
      variant: 'success',
    });
    closeComposeSheet();
  });

  return (
    <BottomSheet
      open={composeSheetOpen}
      closeLabel="关闭树洞发布面板"
      contentClassName="space-y-4"
      onClose={closeComposeSheet}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-lg font-semibold text-ink">发一条树洞</p>
          <p className="text-sm leading-6 text-muted">
            默认匿名
          </p>
        </div>
        <Button size="xs" type="button" variant="subtle" onClick={closeComposeSheet}>
          关闭
        </Button>
      </div>

      {metaQuery.isError ? (
        <div className="rounded-[1.05rem] bg-error-soft p-4 text-sm leading-6 text-error">
          {metaQuery.error instanceof Error ? metaQuery.error.message : '暂时无法加载树洞配置'}
        </div>
      ) : null}

      <form className="space-y-4" onSubmit={onSubmit}>
        <label className="block space-y-2">
          <span className="text-sm font-medium text-ink">内容</span>
          <textarea
            className="min-h-40 w-full rounded-[1.05rem] border border-line bg-white/80 px-3.5 py-3 text-ink outline-none focus:border-transparent focus:ring-2 focus:ring-tint/20"
            maxLength={maxPostLength}
            placeholder="写点什么"
            {...register('content')}
          />
          <div className="flex items-center justify-between gap-3 text-xs text-muted">
            <span>{errors.content?.message || '发后可删除'}</span>
            <span>{contentValue.length} / {maxPostLength}</span>
          </div>
        </label>

        <div className="flex justify-end">
          <Button
            className="min-w-[6rem]"
            disabled={createMutation.isPending}
            size="md"
            type="submit"
            variant="primary"
          >
            {createMutation.isPending ? '发布中...' : '发布'}
          </Button>
        </div>
      </form>
    </BottomSheet>
  );
}
