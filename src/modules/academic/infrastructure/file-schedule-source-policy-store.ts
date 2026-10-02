/**
 * [INPUT]: 依赖 node:fs/promises/path/crypto、北京时区时钟、Logger 与 domain 策略端口
 * [OUTPUT]: 对外提供 FileScheduleSourcePolicyStore，以原子状态文件和存活 owner 隔离锁目录持久化热切换快照
 * [POS]: academic/infrastructure 的课表来源策略存储，以成功发布水位保护最后有效快照与告警状态，负责 env 回落、损坏降级及跨进程传播；rename 为提交点，锁清理故障由下次获取重试自己的 owner
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { randomUUID } from 'node:crypto';
import { mkdir, open, readFile, readdir, rename, rmdir, stat, unlink } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { Logger } from '../../../utils/logger';
import { beijingIsoString } from '../../../utils/time';
import {
  isScheduleSourceMode,
  type ScheduleSourceMode,
  type ScheduleSourcePolicySnapshot,
  type ScheduleSourcePolicyStore,
} from '../domain/schedule-source-policy';

const DEFAULT_MODE: ScheduleSourceMode = 'mobile-jw-first';
const LOCK_RETRY_LIMIT = 40;
const LOCK_RETRY_DELAY_MS = 10;
const STALE_LOCK_MS = 30_000;

type FileFingerprint = string;

type OwnedPolicyLock = {
  directory: string;
  ownerFile: string;
};

function freezeSnapshot(snapshot: ScheduleSourcePolicySnapshot): ScheduleSourcePolicySnapshot {
  return Object.freeze({ ...snapshot });
}

function validateStoredSnapshot(value: unknown): ScheduleSourcePolicySnapshot {
  const candidate = value as Partial<ScheduleSourcePolicySnapshot> | null;
  if (!candidate || !isScheduleSourceMode(candidate.mode)) throw new Error('mode 无效');
  if (typeof candidate.updatedAt !== 'string' || !candidate.updatedAt) throw new Error('updatedAt 无效');
  if (typeof candidate.updatedBy !== 'string' || !candidate.updatedBy) throw new Error('updatedBy 无效');
  return freezeSnapshot({
    mode: candidate.mode,
    updatedAt: candidate.updatedAt,
    updatedBy: candidate.updatedBy,
  });
}

function fingerprint(fileStat: { mtimeMs: number; ctimeMs: number; size: number }): FileFingerprint {
  return `${fileStat.mtimeMs}:${fileStat.ctimeMs}:${fileStat.size}`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class FileScheduleSourcePolicyStore implements ScheduleSourcePolicyStore {
  private snapshot: ScheduleSourcePolicySnapshot;
  private sequence = 0;
  private publishedSequence = 0;
  private warningSequence = 0;
  private fileFingerprint: FileFingerprint | null = null;
  private lastReadWarningFingerprint: FileFingerprint | 'missing' | 'unreadable' | null = null;
  private readonly pendingLockReleases = new Set<OwnedPolicyLock>();
  private readonly lockReleases = new Map<OwnedPolicyLock, Promise<void>>();

  constructor(
    private readonly stateFile: string,
    environmentMode?: string,
  ) {
    const normalizedMode = environmentMode?.trim();
    const mode = isScheduleSourceMode(normalizedMode) ? normalizedMode : DEFAULT_MODE;
    if (normalizedMode && !isScheduleSourceMode(normalizedMode)) {
      Logger.warn('SchedulePolicy', `SCHEDULE_SOURCE_MODE=${normalizedMode} 无效，回落 ${DEFAULT_MODE}`);
    }
    this.snapshot = freezeSnapshot({
      mode,
      updatedAt: beijingIsoString(),
      updatedBy: normalizedMode ? 'env:SCHEDULE_SOURCE_MODE' : 'default',
    });
  }

  async read(): Promise<ScheduleSourcePolicySnapshot> {
    const sequence = ++this.sequence;
    try {
      const fileStat = await stat(this.stateFile);
      const nextFingerprint = fingerprint(fileStat);
      if (sequence < this.publishedSequence) return this.snapshot;
      if (nextFingerprint === this.fileFingerprint) {
        this.publishSnapshot(sequence, this.snapshot, nextFingerprint);
        return this.snapshot;
      }

      const parsed = validateStoredSnapshot(JSON.parse(await readFile(this.stateFile, 'utf8')));
      this.publishSnapshot(sequence, parsed, nextFingerprint);
    } catch (cause: any) {
      if (sequence < this.publishedSequence || sequence < this.warningSequence) return this.snapshot;
      if (cause?.code === 'ENOENT') {
        this.warningSequence = sequence;
        if (this.lastReadWarningFingerprint !== 'missing') {
          Logger.warn('SchedulePolicy', '策略状态文件不存在，保留最后有效快照');
          this.lastReadWarningFingerprint = 'missing';
        }
        return this.snapshot;
      }

      let failureFingerprint: FileFingerprint | 'unreadable' = 'unreadable';
      try {
        failureFingerprint = fingerprint(await stat(this.stateFile));
      } catch {
        // 状态文件在错误处理期间消失，沿用最后有效快照。
      }
      if (sequence < this.publishedSequence || sequence < this.warningSequence) return this.snapshot;
      this.warningSequence = sequence;
      if (failureFingerprint !== this.lastReadWarningFingerprint) {
        Logger.warn(
          'SchedulePolicy',
          '策略状态文件读取失败，保留最后有效快照',
          cause instanceof Error ? cause.message : String(cause),
        );
        this.lastReadWarningFingerprint = failureFingerprint;
      }
    }
    return this.snapshot;
  }

  async write(mode: ScheduleSourceMode, updatedBy: string): Promise<ScheduleSourcePolicySnapshot> {
    const lockDirectory = `${this.stateFile}.lock`;
    await mkdir(dirname(this.stateFile), { recursive: true });
    const lock = await this.acquireLock(lockDirectory);
    try {
      const next = freezeSnapshot({
        mode,
        updatedAt: beijingIsoString(),
        updatedBy,
      });
      const tempFile = `${this.stateFile}.${process.pid}.${randomUUID()}.tmp`;
      let tempCreated = false;
      try {
        const handle = await open(tempFile, 'wx', 0o600);
        tempCreated = true;
        try {
          await handle.writeFile(`${JSON.stringify(next, null, 2)}\n`, 'utf8');
          await handle.sync();
        } finally {
          await handle.close();
        }
        // 租约被接管后，旧 owner 即使恢复执行也不能发布过期版本。
        await this.assertLockOwned(lock);
        await rename(tempFile, this.stateFile);
      } catch (cause) {
        if (tempCreated) await unlink(tempFile).catch(() => {});
        throw cause;
      }

      // rename 已提交持久状态；指纹可在下一次读取时重建，不让后置 stat 故障撤回成功。
      // 写失败不领取发布代次；成功提交则压住此前开始的所有读取。
      this.publishSnapshot(++this.sequence, next, null);
      return next;
    } finally {
      await this.releaseOrRememberLock(lock);
    }
  }

  private publishSnapshot(sequence: number, snapshot: ScheduleSourcePolicySnapshot, fileFingerprint: FileFingerprint | null): void {
    if (sequence < this.publishedSequence) return;
    this.snapshot = snapshot;
    this.fileFingerprint = fileFingerprint;
    this.publishedSequence = sequence;
    // 较旧成功可补齐最后有效快照，但不能抹去较新失败的告警去重状态。
    if (sequence >= this.warningSequence) {
      this.warningSequence = sequence;
      this.lastReadWarningFingerprint = null;
    }
  }

  private async acquireLock(lockDirectory: string): Promise<OwnedPolicyLock> {
    const ownerToken = `${process.pid}-${randomUUID()}`;
    for (let attempt = 0; attempt < LOCK_RETRY_LIMIT; attempt += 1) {
      for (const pending of this.pendingLockReleases) await this.releaseOrRememberLock(pending, false);
      try {
        await mkdir(lockDirectory, { mode: 0o700 });
      } catch (cause: any) {
        if (cause?.code !== 'EEXIST') throw cause;
        const recovered = await this.tryRecoverStaleLock(lockDirectory, ownerToken);
        if (recovered) return recovered;
        if (attempt === LOCK_RETRY_LIMIT - 1) {
          throw new Error('课表来源策略正在被其他进程修改，请稍后重试');
        }
        await delay(LOCK_RETRY_DELAY_MS);
        continue;
      }

      const lock = { directory: lockDirectory, ownerFile: join(lockDirectory, `owner-${ownerToken}`) };
      try {
        await this.writeLockMarker(lock.ownerFile, ownerToken);
        return lock;
      } catch (cause) {
        // 尽力释放失败初始化已生成的 marker；没有 marker 的目录沿用空锁回收规则。
        await this.releaseOrRememberLock(lock);
        throw cause;
      }
    }
    throw new Error('无法获取课表来源策略写锁');
  }

  private async tryRecoverStaleLock(
    lockDirectory: string,
    ownerToken: string,
  ): Promise<OwnedPolicyLock | null> {
    let lockStat;
    try {
      lockStat = await stat(lockDirectory);
    } catch (cause: any) {
      if (cause?.code === 'ENOENT') return null;
      throw cause;
    }

    // 兼容旧版本遗留的单文件锁；替换成目录后旧 owner 的 unlink 不会删除新锁。
    if (!lockStat.isDirectory()) {
      if (Date.now() - lockStat.mtimeMs <= STALE_LOCK_MS) return null;
      await unlink(lockDirectory).catch((cause: any) => {
        if (cause?.code !== 'ENOENT') throw cause;
      });
      return null;
    }

    const takeoverFile = join(lockDirectory, 'takeover');
    const owner = await this.findLockOwner(lockDirectory);
    if (!owner) {
      if (Date.now() - lockStat.mtimeMs <= STALE_LOCK_MS) return null;
      const takeoverActive = await this.isActiveMarker(takeoverFile);
      if (!takeoverActive) {
        await unlink(takeoverFile).catch(() => {});
        await rmdir(lockDirectory).catch((cause: any) => {
          if (cause?.code !== 'ENOENT' && cause?.code !== 'ENOTEMPTY') throw cause;
        });
      }
      return null;
    }
    if (Date.now() - owner.mtimeMs <= STALE_LOCK_MS) return null;
    if (await this.isLockOwnerProcessAlive(owner.path)) return null;

    let takeoverHandle;
    try {
      takeoverHandle = await open(takeoverFile, 'wx', 0o600);
      await takeoverHandle.writeFile(ownerToken, 'utf8');
      await takeoverHandle.sync();
    } catch (cause: any) {
      if (cause?.code === 'EEXIST') {
        if (!(await this.isActiveMarker(takeoverFile))) await unlink(takeoverFile).catch(() => {});
        return null;
      }
      if (cause?.code === 'ENOENT') return null;
      throw cause;
    } finally {
      await takeoverHandle?.close();
    }

    try {
      const currentOwner = await this.findLockOwner(lockDirectory);
      if (!currentOwner || currentOwner.path !== owner.path) return null;
      if (Date.now() - currentOwner.mtimeMs <= STALE_LOCK_MS) return null;

      await unlink(currentOwner.path).catch((cause: any) => {
        if (cause?.code !== 'ENOENT') throw cause;
      });
      const lock = { directory: lockDirectory, ownerFile: join(lockDirectory, `owner-${ownerToken}`) };
      try {
        await this.writeLockMarker(lock.ownerFile, ownerToken);
        return lock;
      } catch (cause) {
        // 接管后的 marker 也可能只完成部分写入，必须登记自身 owner 的释放。
        await this.releaseOrRememberLock(lock);
        throw cause;
      }
    } finally {
      await unlink(takeoverFile).catch(() => {});
    }
  }

  private async findLockOwner(lockDirectory: string): Promise<{ path: string; mtimeMs: number } | null> {
    let entries: string[];
    try {
      entries = await readdir(lockDirectory);
    } catch (cause: any) {
      if (cause?.code === 'ENOENT' || cause?.code === 'ENOTDIR') return null;
      throw cause;
    }
    const ownerName = entries.find((entry) => entry.startsWith('owner-'));
    if (!ownerName) return null;
    const path = join(lockDirectory, ownerName);
    try {
      return { path, mtimeMs: (await stat(path)).mtimeMs };
    } catch (cause: any) {
      if (cause?.code === 'ENOENT') return null;
      throw cause;
    }
  }

  private async isActiveMarker(path: string): Promise<boolean> {
    try {
      return Date.now() - (await stat(path)).mtimeMs <= STALE_LOCK_MS;
    } catch (cause: any) {
      if (cause?.code === 'ENOENT') return false;
      throw cause;
    }
  }

  private async isLockOwnerProcessAlive(ownerFile: string): Promise<boolean> {
    let ownerToken: string;
    try {
      ownerToken = (await readFile(ownerFile, 'utf8')).trim();
    } catch (cause: any) {
      if (cause?.code === 'ENOENT') return false;
      throw cause;
    }

    const pid = Number(ownerToken.match(/^(\d+)-/)?.[1]);
    if (!Number.isInteger(pid) || pid <= 0) return false;
    try {
      process.kill(pid, 0);
      return true;
    } catch (cause: any) {
      return cause?.code !== 'ESRCH';
    }
  }

  private async writeLockMarker(path: string, ownerToken: string): Promise<void> {
    const handle = await open(path, 'wx', 0o600);
    try {
      await handle.writeFile(ownerToken, 'utf8');
      await handle.sync();
    } finally {
      await handle.close();
    }
  }

  private async releaseLock(lock: OwnedPolicyLock): Promise<void> {
    // 只删除自己的 owner 文件；即使锁已被接管，也绝不触碰新 owner 标记。
    try {
      await unlink(lock.ownerFile);
    } catch (cause: any) {
      // 迟到清理已经没有 owner 归属，不能删除随后创建的新锁目录。
      // 无 owner 的遗留空目录由 acquire 的三十秒回收规则处理。
      if (cause?.code === 'ENOENT') return;
      throw cause;
    }
    await rmdir(lock.directory).catch((cause: any) => {
      if (cause?.code !== 'ENOENT' && cause?.code !== 'ENOTEMPTY') throw cause;
    });
  }

  private async releaseOrRememberLock(lock: OwnedPolicyLock, warnOnFailure = true): Promise<void> {
    const active = this.lockReleases.get(lock);
    if (active) return active;
    // 同 owner 清理也合流，避免两个重试在旧目录移除后再清理新 owner 的空目录。
    const release = (async () => {
      try {
        await this.releaseLock(lock);
        this.pendingLockReleases.delete(lock);
      } catch (cause) {
        // 活进程的 owner 不会被 stale 接管；保留精确归属供下次获取时重试释放。
        this.pendingLockReleases.add(lock);
        if (warnOnFailure) {
          Logger.warn('SchedulePolicy', '策略写锁清理失败，下次切换将重试释放', cause instanceof Error ? cause.message : String(cause));
        }
      }
    })();
    this.lockReleases.set(lock, release);
    try {
      await release;
    } finally {
      this.lockReleases.delete(lock);
    }
  }

  private async assertLockOwned(lock: OwnedPolicyLock): Promise<void> {
    try {
      await stat(lock.ownerFile);
    } catch (cause: any) {
      if (cause?.code === 'ENOENT') throw new Error('课表来源策略写锁已被其他进程接管');
      throw cause;
    }
  }
}
