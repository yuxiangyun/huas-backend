import type { Context, Next } from 'hono';
import { verifyToken } from '../auth/jwt';
import { error } from '../utils/response';
import { ErrorCode } from '../utils/errors';

// Extend Hono context variables
declare module 'hono' {
  interface ContextVariableMap {
    userId: number;
    studentId: string;
  }
}

export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return error(c, ErrorCode.JWT_INVALID, 'Missing or invalid Authorization header', 401);
  }

  const token = authHeader.slice(7);
  const payload = await verifyToken(token);

  if (!payload) {
    return error(c, ErrorCode.JWT_INVALID, 'Invalid or expired token', 401);
  }

  c.set('userId', payload.userId);
  c.set('studentId', payload.studentId);

  await next();
}
