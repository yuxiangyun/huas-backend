import { z } from 'zod';

export const loginSchema = z.object({
  username: z.string().trim().min(1, '请输入学号'),
  password: z.string().trim().min(1, '请输入密码'),
  captcha: z.string().trim().optional(),
});

export type LoginFormValues = z.infer<typeof loginSchema>;
