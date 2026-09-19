/**
 * [INPUT]: 依赖单 writer 进程内同学号真实认证的开始及结束生命周期
 * [OUTPUT]: 对外提供内部 AuthenticationAttempts，以成功提交序号保护迟到认证并按在途计数回收
 * [POS]: SchoolAccess 条件提交的进程内排序屏障，首次身份创建也不需要提前写用户表
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

interface AttemptGroup { active: number; next: number; committed: number }
export interface AuthenticationAttempt {
  readonly studentId: string;
  readonly sequence: number;
  readonly group: AttemptGroup;
}

export class AuthenticationAttempts {
  private readonly groups = new Map<string, AttemptGroup>();

  begin(studentId: string): AuthenticationAttempt {
    const group = this.groups.get(studentId) ?? { active: 0, next: 0, committed: 0 };
    this.groups.set(studentId, group);
    group.active += 1;
    return { studentId, sequence: ++group.next, group };
  }

  canCommit(attempt: AuthenticationAttempt): boolean {
    return this.groups.get(attempt.studentId) === attempt.group && attempt.sequence > attempt.group.committed;
  }

  committed(attempt: AuthenticationAttempt): void {
    attempt.group.committed = attempt.sequence;
  }

  finish(attempt: AuthenticationAttempt): void {
    attempt.group.active -= 1;
    if (attempt.group.active === 0) this.groups.delete(attempt.studentId);
  }
}

export const authenticationAttempts = new AuthenticationAttempts();
