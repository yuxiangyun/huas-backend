import { sign, verify } from 'hono/jwt';
import { config } from '../config';

interface JwtPayload {
  userId: number;
  studentId: string;
  exp: number;
  iat: number;
}

export async function generateToken(payload: { userId: number; studentId: string }): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return sign(
    {
      userId: payload.userId,
      studentId: payload.studentId,
      iat: now,
      exp: now + Math.floor(config.ttl.selfJwt / 1000),
    },
    config.jwtSecret,
    'HS256'
  );
}

export async function verifyToken(token: string): Promise<JwtPayload | null> {
  try {
    const payload = await verify(token, config.jwtSecret, 'HS256') as unknown as JwtPayload;
    return payload;
  } catch {
    return null;
  }
}
