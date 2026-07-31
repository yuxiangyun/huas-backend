/**
 * [INPUT]: 依赖非生产环境、当前 SQLite/JWT 配置、唯一应用组合根、Drizzle 与 sharp 生成的本地图片夹具
 * [OUTPUT]: 提供幂等 Social 测试数据命令，创建本地账户、Community 头像/昵称、Treehole 文本帖与 Discover 单图/多图帖
 * [POS]: scripts 的开发数据播种入口，复用生产应用服务维持媒体与内容不变式，且在生产环境硬失败
 * [PROTOCOL]: 变更时更新此头部，然后检查 AGENTS.md
 */

import { and, eq, isNull } from 'drizzle-orm';
import sharp from 'sharp';
import { createApplicationComposition } from '../src/composition';
import { config } from '../src/config';
import {
  assertConfiguredDatabaseSchemaCurrent,
  closeDatabase,
  getDb,
  schema,
} from '../src/db';
import { CryptoHelper } from '../src/utils/crypto';

const TEST_ACCOUNT = {
  username: 'test',
  password: '123456',
  name: 'Web Social 测试账户',
  className: '本地测试班',
  nickname: '测试同学',
} as const;

const TREEHOLE_FIXTURES = [
  '【测试数据】晚课结束后路过湖边，风很舒服。这里用来测试短文本帖子、作者资料和时间展示。',
  '【测试数据｜多行排版】\n今天想吃点清淡的，大家有什么食堂窗口推荐？\n\n顺便测试一下换行、标点和评论入口 👀',
  '【测试数据】周末准备整理宿舍和写代码。目标很朴素：先把待办清空，再奖励自己一杯奶茶 ☕',
] as const;

type FixtureImage = 'campus' | 'meal';

interface DiscoverFixture {
  title: string;
  category: '2食堂' | '其他';
  storeName: string;
  priceText: string;
  content: string;
  tags: string[];
  images: FixtureImage[];
}

const DISCOVER_FIXTURES: DiscoverFixture[] = [
  {
    title: '【测试数据】暖光下的一碗牛肉面',
    category: '2食堂',
    storeName: '二食堂面档（测试）',
    priceText: '¥12',
    content: '汤底偏浓，牛肉分量看起来不错。这条用于测试单图封面、价格、店名和标签展示。',
    tags: ['好吃', '分量足', '值得再吃'],
    images: ['meal'],
  },
  {
    title: '【测试数据】从湖边散步到晚饭',
    category: '其他',
    storeName: '校园生活测试',
    priceText: '约 ¥12',
    content: '两张合成测试图：先看晚霞湖景，再去吃一碗热面。用于检查多图轮播、图片详情和不同画面下的裁切。',
    tags: ['校园', '晚霞', '晚餐'],
    images: ['campus', 'meal'],
  },
];

function assertDevelopmentEnvironment() {
  if (process.env.NODE_ENV?.trim().toLowerCase() === 'production') {
    throw new Error('Social 测试数据脚本禁止在 NODE_ENV=production 中运行');
  }
}

function upsertTestAccount() {
  const db = getDb();
  const now = new Date();
  return db.transaction((tx) => {
    const user = tx.insert(schema.users).values({
      studentId: TEST_ACCOUNT.username,
      name: TEST_ACCOUNT.name,
      className: TEST_ACCOUNT.className,
      encryptedPassword: CryptoHelper.encryptAES(TEST_ACCOUNT.password, config.jwtSecret),
      createdAt: now,
      lastLoginAt: now,
      lastActiveAt: now,
    }).onConflictDoUpdate({
      target: schema.users.studentId,
      set: {
        name: TEST_ACCOUNT.name,
        className: TEST_ACCOUNT.className,
        encryptedPassword: CryptoHelper.encryptAES(TEST_ACCOUNT.password, config.jwtSecret),
        lastLoginAt: now,
        lastActiveAt: now,
      },
    }).returning({ id: schema.users.id }).get();

    if (!user) throw new Error('Social 测试账户创建失败');

    // 测试账户不应携带任何学校上游凭证或交互恢复标记。
    tx.delete(schema.credentials).where(eq(schema.credentials.userId, user.id)).run();
    tx.insert(schema.communityProfiles).values({
      userId: user.id,
      nickname: TEST_ACCOUNT.nickname,
      avatarUrl: null,
      updatedAt: now,
    }).onConflictDoUpdate({
      target: schema.communityProfiles.userId,
      set: { nickname: TEST_ACCOUNT.nickname, updatedAt: now },
    }).run();
    return user.id;
  });
}

async function renderFixturePng(kind: FixtureImage | 'avatar'): Promise<Buffer> {
  const svg = kind === 'campus'
    ? campusSvg()
    : kind === 'meal'
      ? mealSvg()
      : avatarSvg();
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function fixtureFile(kind: FixtureImage | 'avatar'): Promise<File> {
  const image = await renderFixturePng(kind);
  const bytes = new Uint8Array(image.byteLength);
  bytes.set(image);
  return new File([bytes.buffer], `social-test-${kind}.png`, { type: 'image/png' });
}

function campusSvg() {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900">
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#74b9ff"/><stop offset="1" stop-color="#ffd38a"/></linearGradient>
        <linearGradient id="water" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#6bb8c7"/><stop offset="1" stop-color="#214c66"/></linearGradient>
      </defs>
      <rect width="1200" height="520" fill="url(#sky)"/><circle cx="930" cy="175" r="82" fill="#fff1a8" opacity=".92"/>
      <rect y="520" width="1200" height="380" fill="url(#water)"/>
      <path d="M0 520 Q180 430 360 510 T720 500 T1200 510 V570 H0Z" fill="#2f7349"/>
      <g fill="#e8edf2" stroke="#6d7f8d" stroke-width="5"><rect x="130" y="300" width="430" height="245" rx="8"/><rect x="205" y="245" width="280" height="300" rx="8"/></g>
      <g fill="#79a9cb"><rect x="240" y="285" width="70" height="80"/><rect x="335" y="285" width="70" height="80"/><rect x="240" y="390" width="70" height="80"/><rect x="335" y="390" width="70" height="80"/></g>
      <g fill="#276749"><circle cx="90" cy="470" r="95"/><circle cx="620" cy="470" r="105"/><circle cx="760" cy="485" r="82"/><circle cx="1080" cy="460" r="115"/></g>
      <path d="M760 610 C900 560 1040 600 1200 690 L1200 900 L980 900 C950 770 865 690 760 650Z" fill="#dfcfb1"/>
      <g opacity=".28"><rect x="220" y="560" width="310" height="26" fill="#f1f5f8"/><ellipse cx="930" cy="620" rx="170" ry="24" fill="#ffd86b"/></g>
    </svg>`;
}

function mealSvg() {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900">
      <defs><linearGradient id="table" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#8f4e2f"/><stop offset="1" stop-color="#d69a58"/></linearGradient></defs>
      <rect width="1200" height="900" fill="url(#table)"/>
      <ellipse cx="650" cy="530" rx="430" ry="280" fill="#eee1c7" stroke="#5e4030" stroke-width="18"/>
      <ellipse cx="650" cy="505" rx="365" ry="220" fill="#a84324"/>
      <g fill="none" stroke="#f3d47a" stroke-width="18" stroke-linecap="round">
        <path d="M390 430 C520 350 690 620 880 430"/><path d="M380 500 C560 650 730 330 920 520"/><path d="M430 570 C590 390 770 700 900 560"/>
      </g>
      <g fill="#6b3527"><ellipse cx="520" cy="420" rx="78" ry="52"/><ellipse cx="750" cy="435" rx="88" ry="55"/><ellipse cx="690" cy="590" rx="82" ry="50"/></g>
      <g fill="#4f8a3d"><ellipse cx="480" cy="560" rx="90" ry="32" transform="rotate(-28 480 560)"/><ellipse cx="820" cy="540" rx="100" ry="34" transform="rotate(24 820 540)"/></g>
      <g fill="#65a844"><circle cx="610" cy="405" r="14"/><circle cx="635" cy="390" r="11"/><circle cx="665" cy="420" r="13"/><circle cx="710" cy="520" r="12"/></g>
      <ellipse cx="210" cy="220" rx="145" ry="105" fill="#e8d9bd" stroke="#5e4030" stroke-width="12"/><g fill="#6c8f3b"><rect x="105" y="190" width="210" height="28" rx="14" transform="rotate(12 210 204)"/><rect x="120" y="230" width="180" height="26" rx="13" transform="rotate(-15 210 243)"/></g>
      <path d="M540 155 C520 105 575 80 550 30 M650 160 C625 110 685 85 660 25 M760 170 C735 115 790 90 770 40" fill="none" stroke="#fff" stroke-width="16" opacity=".42" stroke-linecap="round"/>
    </svg>`;
}

function avatarSvg() {
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
      <defs><linearGradient id="avatar" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#5b8def"/><stop offset="1" stop-color="#8d5bea"/></linearGradient></defs>
      <rect width="512" height="512" rx="128" fill="url(#avatar)"/>
      <circle cx="256" cy="205" r="92" fill="#f5d6bd"/>
      <path d="M112 480 C125 340 190 306 256 306 C322 306 387 340 400 480Z" fill="#e8f0ff"/>
      <path d="M166 190 C170 86 341 73 354 202 C318 155 224 147 166 190Z" fill="#24314f"/>
      <circle cx="225" cy="211" r="9" fill="#24314f"/><circle cx="291" cy="211" r="9" fill="#24314f"/>
      <path d="M225 255 Q256 276 287 255" fill="none" stroke="#b66b67" stroke-width="9" stroke-linecap="round"/>
    </svg>`;
}

async function seedTreehole(userId: number, composition: ReturnType<typeof createApplicationComposition>) {
  const db = getDb();
  const rows = await db.select({ id: schema.treeholePosts.id, content: schema.treeholePosts.content })
    .from(schema.treeholePosts)
    .where(and(eq(schema.treeholePosts.userId, userId), isNull(schema.treeholePosts.deletedAt)));
  const existing = new Map(rows.map((row) => [row.content, row.id]));
  const result: Array<{ id: number; state: 'created' | 'existing' }> = [];

  for (const content of TREEHOLE_FIXTURES) {
    const existingId = existing.get(content);
    if (existingId) {
      result.push({ id: existingId, state: 'existing' });
      continue;
    }
    const post = await composition.social.treehole.service.createPost({ userId, content });
    if (!post) throw new Error('Treehole 测试帖创建失败');
    result.push({ id: post.id, state: 'created' });
  }
  return result;
}

async function seedDiscover(userId: number, composition: ReturnType<typeof createApplicationComposition>) {
  const db = getDb();
  const rows = await db.select({ id: schema.discoverPosts.id, title: schema.discoverPosts.title })
    .from(schema.discoverPosts)
    .where(and(eq(schema.discoverPosts.userId, userId), isNull(schema.discoverPosts.deletedAt)));
  const existing = new Map(rows.map((row) => [row.title, row.id]));
  const result: Array<{ id: number; state: 'created' | 'existing'; imageCount: number }> = [];

  for (const fixture of DISCOVER_FIXTURES) {
    const existingId = existing.get(fixture.title);
    if (existingId) {
      const row = await db.select({ imageCount: schema.discoverPosts.imageCount })
        .from(schema.discoverPosts)
        .where(eq(schema.discoverPosts.id, existingId))
        .limit(1);
      result.push({ id: existingId, state: 'existing', imageCount: row[0]?.imageCount ?? 0 });
      continue;
    }
    const images = await Promise.all(fixture.images.map((image) => fixtureFile(image)));
    const post = await composition.social.discover.service.createPost({ userId, ...fixture, images });
    if (!post) throw new Error('Discover 测试帖创建失败');
    result.push({ id: post.id, state: 'created', imageCount: post.imageCount });
  }
  return result;
}

async function main() {
  assertDevelopmentEnvironment();
  assertConfiguredDatabaseSchemaCurrent();
  const userId = upsertTestAccount();
  const composition = createApplicationComposition();

  try {
    const profile = await composition.social.community.getCurrentProfile(userId);
    if (!profile) throw new Error('Social 测试账户资料不存在');
    if (!profile.avatarUrl) {
      await composition.social.community.updateProfile(userId, {
        nickname: TEST_ACCOUNT.nickname,
        avatar: await fixtureFile('avatar'),
      });
    }

    const [treehole, discover] = await Promise.all([
      seedTreehole(userId, composition),
      seedDiscover(userId, composition),
    ]);
    const currentProfile = await composition.social.community.getCurrentProfile(userId);

    console.log(JSON.stringify({
      database: config.dbPath,
      account: { username: TEST_ACCOUNT.username, password: TEST_ACCOUNT.password, userId },
      profile: currentProfile,
      treehole,
      discover,
    }, null, 2));
  } finally {
    composition.dispose();
  }
}

try {
  await main();
} finally {
  closeDatabase();
}
