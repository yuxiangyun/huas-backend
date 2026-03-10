import { z } from 'zod';

export const createPostSchema = z.object({
  category: z.string().trim().min(1, '请选择分类'),
  title: z.string().trim().min(1, '请输入标题').max(80, '标题不能超过 80 个字'),
  storeName: z.string().trim().max(32, '档口或店名不能超过 32 个字'),
  priceText: z.string().trim().max(20, '价格信息不能超过 20 个字'),
  content: z.string().trim().min(10, '至少写 10 个字').max(400, '推荐说明不能超过 400 个字'),
  customTags: z.string().optional(),
});

export type CreatePostFormValues = z.infer<typeof createPostSchema>;
