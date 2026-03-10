import { z } from 'zod';

export const createPostSchema = z.object({
  category: z.string().trim().min(1, '请选择分类'),
  title: z.string().trim().max(80, '标题不能超过 80 个字').optional(),
  customTags: z.string().optional(),
});

export type CreatePostFormValues = z.infer<typeof createPostSchema>;
