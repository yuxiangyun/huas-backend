/**
 * [INPUT]: 依赖本机 ssh/scp、远端活动 release、显式远端 DB/manifest 参数与本地 Early Rising mock 播种脚本
 * [OUTPUT]: 提供从本机安全编排百度远端 mock 打卡生成/撤销的一条命令入口，并自动清理远端临时执行目录
 * [POS]: scripts 的远程开发数据适配器，只负责传输和执行边界，不复制本地播种规则或持久化到 release
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { resolve } from 'node:path';

const DEFAULT_HOST = 'baidu';
const REMOTE_CONTROL_DIR = '/www/wwwroot/huas-server/.deploy';
const REMOTE_TEMP_PREFIX = '/tmp/huas-early-rising-remote.';
const LOCAL_SEED_SCRIPT = resolve(import.meta.dir, 'seed-early-rising-mock.ts');

function shellQuote(value: string) {
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

function usage(): never {
  console.error([
    'Usage:',
    '  bun run seed:early-rising:remote -- --host baidu --db <remote-db> --apply [seed options] --allow-real-db',
    '  bun run seed:early-rising:remote -- --host baidu --db <remote-db> --undo <remote-manifest> --allow-real-db',
  ].join('\n'));
  process.exit(2);
}

function run(command: string[], options: { printOutput?: boolean } = {}) {
  const result = Bun.spawnSync(command, {
    cwd: process.cwd(),
    stdout: 'pipe',
    stderr: 'pipe',
  });
  if (options.printOutput) {
    process.stdout.write(result.stdout);
    process.stderr.write(result.stderr);
  }
  return result;
}

function parseArguments(args: string[]) {
  const hostIndex = args.indexOf('--host');
  const host = hostIndex >= 0 ? args[hostIndex + 1] : DEFAULT_HOST;
  if (!host || !/^[A-Za-z0-9._-]+$/.test(host)) {
    throw new Error('--host 只能使用 SSH config 主机名');
  }
  const forwarded = [...args];
  if (hostIndex >= 0) forwarded.splice(hostIndex, 2);
  if (!forwarded.includes('--db')) usage();
  const undoIndex = forwarded.indexOf('--undo');
  const apply = forwarded.includes('--apply');
  if ((apply && undoIndex >= 0) || (!apply && undoIndex < 0)) usage();
  if (!forwarded.includes('--allow-real-db')) {
    throw new Error('远端真实数据库操作必须显式传入 --allow-real-db');
  }
  return { host, forwarded };
}

function createRemoteWorkspace(host: string) {
  const remoteSetup = `set -eu
control_dir=${shellQuote(REMOTE_CONTROL_DIR)}
active_slot=$(cat "$control_dir/active-slot")
release_dir=$(readlink -f "$control_dir/current/$active_slot")
test -f "$release_dir/src/modules/early-rising/composition.ts"
remote_tmp=$(mktemp -d ${shellQuote(`${REMOTE_TEMP_PREFIX}XXXXXX`)})
mkdir "$remote_tmp/scripts"
ln -s "$release_dir/src" "$remote_tmp/src"
printf '%s' "$remote_tmp"`;
  const result = run(['ssh', host, remoteSetup]);
  if (result.exitCode !== 0) {
    process.stderr.write(result.stderr);
    fail('创建远端 Early Rising 临时执行目录失败');
  }
  const remoteTmp = result.stdout.toString().trim();
  if (!remoteTmp.startsWith(REMOTE_TEMP_PREFIX) || !/^\/tmp\/huas-early-rising-remote\.[A-Za-z0-9]+$/.test(remoteTmp)) {
    fail('远端返回了不可信的临时目录路径');
  }
  return remoteTmp;
}

function cleanupRemoteWorkspace(host: string, remoteTmp: string) {
  const cleanup = `set -eu
target=${shellQuote(remoteTmp)}
case "$target" in ${REMOTE_TEMP_PREFIX}*) ;; *) exit 2 ;; esac
if [ -e "$target" ]; then rm -r "$target"; fi`;
  const result = run(['ssh', host, cleanup]);
  if (result.exitCode !== 0) {
    process.stderr.write(result.stderr);
    console.error(`警告：远端临时目录清理失败 ${remoteTmp}`);
  }
}

function main() {
  const { host, forwarded } = parseArguments(process.argv.slice(2));
  const remoteTmp = createRemoteWorkspace(host);
  try {
    const upload = run([
      'scp',
      LOCAL_SEED_SCRIPT,
      `${host}:${remoteTmp}/scripts/seed-early-rising-mock.ts`,
    ]);
    if (upload.exitCode !== 0) {
      process.stderr.write(upload.stderr);
      fail('上传 Early Rising 播种脚本失败');
    }

    const remoteCommand = `set -eu
cd ${shellQuote(remoteTmp)}
bun scripts/seed-early-rising-mock.ts ${forwarded.map(shellQuote).join(' ')}`;
    const executed = run(['ssh', host, remoteCommand], { printOutput: true });
    if (executed.exitCode !== 0) process.exitCode = executed.exitCode;
  } finally {
    cleanupRemoteWorkspace(host, remoteTmp);
  }
}

try {
  main();
} catch (cause) {
  const message = cause instanceof Error ? cause.message : String(cause);
  console.error(`Early Rising 远端操作失败：${message}`);
  process.exitCode = 1;
}
