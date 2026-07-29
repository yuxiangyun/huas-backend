/**
 * [INPUT]: 依赖 Zod 的字符串校验与类型推导能力
 * [OUTPUT]: 对外提供 loginSchema 与 LoginFormValues
 * [POS]: features/auth-login 的输入边界，在发起校园认证前拒绝缺失学号、密码或非法表单形状
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { z } from 'zod';

export const loginSchema = z.object({
  username: z.string().trim().min(1, '请输入学号'),
  password: z.string().trim().min(1, '请输入密码'),
  captcha: z.string().trim().optional(),
});

export type LoginFormValues = z.infer<typeof loginSchema>;
