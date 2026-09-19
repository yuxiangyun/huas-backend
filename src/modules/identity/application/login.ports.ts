/**
 * [INPUT]: 依赖 Identity 登录领域与 SchoolAccess 公共认证结果
 * [OUTPUT]: 对外提供本地身份读写、密码匹配、令牌、时钟及学校认证端口
 * [POS]: Identity 的应用边界；学校凭证提交和验证码生命周期由 SchoolAccess 负责
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */
import type { LoginUser } from '../domain/login';
import type { SchoolAuthenticationCommand, SchoolAuthenticationResult } from '../../campus-integrations/school-access/school-access';

export interface SchoolAuthenticationPort {
  authenticate(command: SchoolAuthenticationCommand): Promise<SchoolAuthenticationResult>;
  requiresInteraction(userId: number): boolean;
}
export interface IdentityStorePort {
  findByStudentId(studentId: string): Promise<LoginUser | null>;
  touchLocalLogin(userId: number, at: Date): Promise<void>;
}
export interface PasswordCipherPort { matches(encryptedPassword: string, candidate: string): boolean }
export interface LoginTokenPort { issue(payload: { userId: number; studentId: string; name?: string }): Promise<string> }
export interface LoginRuntimePort { now(): Date }
