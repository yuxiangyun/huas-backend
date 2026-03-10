import { z } from 'zod';

export const createTreeholePostSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, '请输入内容')
    .max(500, '树洞内容不能超过 500 个字'),
});

export type CreateTreeholePostFormValues = z.infer<typeof createTreeholePostSchema>;
