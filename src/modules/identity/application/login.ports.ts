/**
 * [INPUT]: 依赖 identity/domain 的用户、凭证与步骤值对象
 * [OUTPUT]: 对外提供 LoginApplicationService 所需的全部外部能力端口，包括与 JWT 签发解耦的真实学校登录上下文提交
 * [POS]: identity/application 的依赖倒置边界，使登录编排与 Hono、Drizzle、Bun/Node 实现解耦
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import type { LoginCredentialSet, LoginStep, LoginUser } from '../domain/login';

export interface CampusSession {
  readonly opaque: unknown;
}

export interface CampusLoginPort {
  start(): Promise<{ session: CampusSession; execution: string | null }>;
  restore(snapshot: string): CampusSession;
  snapshot(session: CampusSession): string;
  login(input: {
    session: CampusSession;
    username: string;
    password: string;
    captcha: string;
    execution: string;
  }): Promise<{
    success: boolean;
    message?: string;
    needCaptcha?: boolean;
    portalToken?: string | null;
    steps?: LoginStep[];
  }>;
  getCaptcha(session: CampusSession): Promise<ArrayBuffer>;
  getExecution(session: CampusSession): Promise<string | null>;
  exchangePortalToken(session: CampusSession): Promise<{ token: string | null; steps: LoginStep[] }>;
  exchangeJwSession(session: CampusSession): Promise<{ success: boolean; steps: LoginStep[] }>;
}

export interface LoginRecoveryPort {
  requiresInteractiveLogin(userId: number): Promise<boolean>;
}

export interface IdentityStorePort {
  findByStudentId(studentId: string): Promise<LoginUser | null>;
  touchLocalLogin(userId: number, at: Date): Promise<void>;
  commitRealSchoolLogin(input: {
    studentId: string;
    encryptedPassword: string;
    credentials: LoginCredentialSet;
    at: Date;
  }): Promise<LoginUser>;
}

export interface PasswordCipherPort {
  encrypt(password: string): string;
  matches(encryptedPassword: string, candidate: string): boolean;
}

export interface LoginTokenPort {
  issue(payload: { userId: number; studentId: string; name?: string }): Promise<string>;
}

export interface UserProfilePort {
  backfill(userId: number, studentId: string): Promise<{ name?: string; className?: string } | null>;
}

export interface LoginRuntimePort {
  now(): Date;
  createId(): string;
  encodeBase64(buffer: ArrayBuffer): string;
}

export interface LoginApplicationConfig {
  captchaSessionTtlMs: number;
  maxCaptchaSessions: number;
}
