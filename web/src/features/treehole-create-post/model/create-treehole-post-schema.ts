/**
 * [INPUT]: 依赖 Zod 表单校验能力，动态长度上限由服务端 Treehole meta 拥有
 * [OUTPUT]: 对外提供正文必填 createTreeholePostSchema 与 CreateTreeholePostFormValues
 * [POS]: features/treehole-create-post 的稳定输入边界，不复制可能由运行配置下调的服务端上限
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { z } from 'zod';

export const createTreeholePostSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, '请输入内容'),
});

export type CreateTreeholePostFormValues = z.infer<typeof createTreeholePostSchema>;
