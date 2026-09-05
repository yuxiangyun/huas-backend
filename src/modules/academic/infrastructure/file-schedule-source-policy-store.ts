/**
 * [INPUT]: 依赖 node:fs/promises/path/crypto、北京时区时钟、Logger 与 domain 策略端口
 * [OUTPUT]: 对外提供 FileScheduleSourcePolicyStore，以原子状态文件和存活 owner 隔离锁目录持久化热切换快照
 * [POS]: academic/infrastructure 的课表来源策略存储，负责 env 回落、损坏保守降级、死进程/遗留 owner 接管与跨进程传播
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
  private fileFingerprint: FileFingerprint | null = null;
  private lastReadWarningFingerprint: FileFingerprint | 'missing' | null = null;

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
    try {
      const fileStat = await stat(this.stateFile);
      const nextFingerprint = fingerprint(fileStat);
      if (nextFingerprint === this.fileFingerprint) return this.snapshot;

      const parsed = validateStoredSnapshot(JSON.parse(await readFile(this.stateFile, 'utf8')));
      this.snapshot = parsed;
      this.fileFingerprint = nextFingerprint;
      this.lastReadWarningFingerprint = null;
    } catch (cause: any) {
      if (cause?.code === 'ENOENT') {
        if (this.lastReadWarningFingerprint !== 'missing') {
          Logger.warn('SchedulePolicy', '策略状态文件不存在，使用环境变量或安全默认值');
          this.lastReadWarningFingerprint = 'missing';
        }
        return this.snapshot;
      }

      let failureFingerprint: FileFingerprint | null = null;
      try {
        failureFingerprint = fingerprint(await stat(this.stateFile));
      } catch {
        // 状态文件在错误处理期间消失，沿用最后有效快照。
      }
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
      this.fileFingerprint = null;
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

      const fileStat = await stat(this.stateFile);
      this.snapshot = next;
      this.fileFingerprint = fingerprint(fileStat);
      this.lastReadWarningFingerprint = null;
      return this.snapshot;
    } finally {
      await this.releaseLock(lock);
    }
  }

  private async acquireLock(lockDirectory: string): Promise<OwnedPolicyLock> {
    const ownerToken = `${process.pid}-${randomUUID()}`;
    for (let attempt = 0; attempt < LOCK_RETRY_LIMIT; attempt += 1) {
      try {
        await mkdir(lockDirectory, { mode: 0o700 });
        const ownerFile = join(lockDirectory, `owner-${ownerToken}`);
        await this.writeLockMarker(ownerFile, ownerToken);
        return { directory: lockDirectory, ownerFile };
      } catch (cause: any) {
        if (cause?.code !== 'EEXIST') throw cause;
      }

      const recovered = await this.tryRecoverStaleLock(lockDirectory, ownerToken);
      if (recovered) return recovered;
      if (attempt === LOCK_RETRY_LIMIT - 1) {
        throw new Error('课表来源策略正在被其他进程修改，请稍后重试');
      }
      await delay(LOCK_RETRY_DELAY_MS);
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
      const ownerFile = join(lockDirectory, `owner-${ownerToken}`);
      await this.writeLockMarker(ownerFile, ownerToken);
      return { directory: lockDirectory, ownerFile };
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
    await unlink(lock.ownerFile).catch((cause: any) => {
      if (cause?.code !== 'ENOENT') throw cause;
    });
    await rmdir(lock.directory).catch((cause: any) => {
      if (cause?.code !== 'ENOENT' && cause?.code !== 'ENOTEMPTY') throw cause;
    });
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
