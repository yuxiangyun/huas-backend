/**
 * [INPUT]: 依赖 Zod 表单校验能力与树洞内容上限
 * [OUTPUT]: 对外提供 createTreeholePostSchema 与 CreateTreeholePostFormValues
 * [POS]: features/treehole-create-post 的输入边界，只在用户提交后返回必要内容错误
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { z } from 'zod';

export const createTreeholePostSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, '请输入内容')
    .max(500, '内容不能超过 500 个字'),
});

export type CreateTreeholePostFormValues = z.infer<typeof createTreeholePostSchema>;
