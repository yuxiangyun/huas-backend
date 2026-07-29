/**
 * [INPUT]: 依赖 Treehole meta/create hooks、React Hook Form、Zod 与发布弹层状态
 * [OUTPUT]: 对外提供 TreeholeComposeSheet，以简洁弹窗提交树洞内容
 * [POS]: widgets/treehole-compose-sheet 的发布表单容器，不展示身份宣传或默认提示反馈
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useUiStore } from '@/app/state/ui-store';
import { useCreateTreeholePostMutation, useTreeholeMetaQuery } from '@/entities/treehole/api/treehole-queries';
import { createTreeholePostSchema, type CreateTreeholePostFormValues } from '@/features/treehole-create-post/model/create-treehole-post-schema';
import { Button } from '@/shared/ui/button';
import { TaskDialog } from '@/shared/ui/task-dialog';

const FORM_ID = 'treehole-compose-form';

export function TreeholeComposeSheet() {
  const composeSheetOpen = useUiStore((state) => state.treeholeComposeSheetOpen);
  const closeComposeSheet = useUiStore((state) => state.closeTreeholeComposeSheet);
  const metaQuery = useTreeholeMetaQuery();
  const createMutation = useCreateTreeholePostMutation();
  const { register, handleSubmit, reset, formState: { errors } } = useForm<CreateTreeholePostFormValues>({
    resolver: zodResolver(createTreeholePostSchema),
    defaultValues: { content: '' },
  });
  const maxPostLength = metaQuery.data?.limits.maxPostLength ?? 500;

  useEffect(() => {
    if (composeSheetOpen) reset({ content: '' });
  }, [composeSheetOpen, reset]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      await createMutation.mutateAsync({ content: values.content.trim() });
      closeComposeSheet();
    } catch {
      // mutation 状态在表单内提供可重试反馈。
    }
  });

  return (
    <TaskDialog
      className="max-w-[36rem]"
      open={composeSheetOpen}
      presentation="modal"
      title="发布动态"
      onClose={closeComposeSheet}
      footer={(
        <Button disabled={createMutation.isPending || metaQuery.isError} form={FORM_ID} fullWidth size="lg" type="submit">
          {createMutation.isPending ? '发布中…' : '发布'}
        </Button>
      )}
    >
      <form id={FORM_ID} onSubmit={onSubmit}>
        <label className="block space-y-2">
          <span className="sr-only">内容</span>
          <textarea
            autoFocus
            className="field-control min-h-56 resize-y border-0 px-0 py-0 text-base leading-7 shadow-none focus:shadow-none sm:min-h-72"
            maxLength={maxPostLength}
            placeholder="写点什么"
            {...register('content')}
          />
          {errors.content ? <p className="text-sm text-error">{errors.content.message}</p> : null}
          {metaQuery.isError ? <p className="text-sm text-error">加载失败，请重试</p> : null}
          {createMutation.isError ? <p className="text-sm text-error">发布失败，请重试</p> : null}
        </label>
      </form>
    </TaskDialog>
  );
}
