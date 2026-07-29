/**
 * [INPUT]: 依赖 Zod 表单校验能力与好饭发布字段上限
 * [OUTPUT]: 对外提供 createPostSchema 与 CreatePostFormValues
 * [POS]: features/discover-create-post 的输入边界，只在用户提交后返回必要字段错误
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { z } from 'zod';

export const createPostSchema = z.object({
  category: z.string().trim().min(1, '请选择分类'),
  title: z.string().trim().min(1, '请输入名称').max(80, '名称不能超过 80 个字'),
  storeName: z.string().trim().max(32, '店名不能超过 32 个字'),
  priceText: z.string().trim().max(20, '价格不能超过 20 个字'),
  content: z.string().trim().min(10, '至少输入 10 个字').max(400, '推荐理由不能超过 400 个字'),
  customTags: z.string().optional(),
});

export type CreatePostFormValues = z.infer<typeof createPostSchema>;
