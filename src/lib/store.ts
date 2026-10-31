import { promises as fs } from "fs";
import path from "path";
import type { Indicator, ReactionType } from "./constants";

// 試作版はJSONファイル1つをDB代わりにする。本番ではDBに置き換える前提。

export const DATA_DIR = path.join(process.cwd(), "data");
export const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
const DB_PATH = path.join(DATA_DIR, "db.json");

export { INDICATORS, REACTIONS, type Indicator, type ReactionType } from "./constants";

/** 投稿をAIが読み取った結果。講義・立地診断の文脈として再利用される（＝AIの育成データ） */
export interface PostInsight {
  indicator: Indicator;
  summary: string;
  mechanism: string;
  tags: string[];
  quality: number;
}

export interface Post {
  id: string;
  uid: string;
  nickname: string;
  areaId: string;
  comment: string;
  image: string | null;
  createdAt: string;
  reactions: Record<ReactionType, string[]>;
  insight: PostInsight | null;
}

export interface TrendCache {
  genre: string;
  report: string;
  sources: { title: string; url: string }[];
  fetchedAt: string;
  by: "api" | "claude-code" | "demo";
}

/** 運営が毎日手で入れる X・Instagram などの流行メモ */
export interface TrendNote {
  id: string;
  genre: string;
  source: string;
  text: string;
  url: string;
  createdAt: string;
}

export interface StoredQuestion {
  id: string;
  uid: string;
  kind: "lecture" | "diagnosis";
  /** 街のID（または自由入力の地名）か、立地調査の結果のID */
  target: string;
  /** 画面に出す名前（街の名前・店名） */
  label: string;
  question: string;
  status: "unpaid" | "paid" | "answered";
  /** stripe：カード決済。test：STRIPE_SECRET_KEY がないときの請求しないテスト決済 */
  payment: "stripe" | "test";
  amount: number;
  checkoutSessionId?: string;
  answer?: string;
  createdAt: string;
  paidAt?: string;
  answeredAt?: string;
}

interface DB {
  posts: Post[];
  trends: Record<string, TrendCache>;
  trendNotes: TrendNote[];
  lectures: Record<string, { data: unknown; postCount: number | string; createdAt: string }>;
  /** 飲み屋街の分析（AIが作ったもの） */
  nightlife: Record<string, { data: unknown; createdAt: string; version: string }>;
  /** 商圏を考える（出店問題）のコメントの回数（「uid:日付」ごと） */
  exerciseUsage: Record<string, number>;
  /** AIへの有料の質問（1回ごとに支払い） */
  questions: Record<string, StoredQuestion>;
  /** 立地調査の結果（支払いの画面から戻ったときに表示し直すため） */
  diagnoses: Record<string, { uid: string; input: { name: string; address: string; genre: string }; result: unknown; createdAt: string }>;
  /** 外部APIの結果のキャッシュ（YouTube・ホットペッパー・e-Stat） */
  sourceCache: Record<string, { data: unknown; fetchedAt: string }>;
  /** /admin で編集したときだけ入る。空ならファイル（data/teachings.md, data/area-notes/*.md）を使う */
  teachingsEdited?: boolean;
  teachings: string;
  areaNotes: Record<string, string>;
}

const EMPTY: DB = { posts: [], trends: {}, trendNotes: [], lectures: {}, nightlife: {}, exerciseUsage: {}, questions: {}, diagnoses: {}, sourceCache: {}, teachings: "", areaNotes: {} };

let queue: Promise<unknown> = Promise.resolve();

async function load(): Promise<DB> {
  try {
    const raw = await fs.readFile(DB_PATH, "utf8");
    return { ...EMPTY, ...JSON.parse(raw) };
  } catch {
    const seeded = await seed();
    await save(seeded);
    return seeded;
  }
}

async function save(db: DB) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = DB_PATH + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(db, null, 2));
  await fs.rename(tmp, DB_PATH);
}

/** 読み取り専用 */
export async function readDB(): Promise<DB> {
  await queue;
  return load();
}

/** 読み書きを直列化して実行する */
export function updateDB<T>(fn: (db: DB) => T | Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const db = await load();
    const result = await fn(db);
    await save(db);
    return result;
  });
  queue = run.catch(() => undefined);
  return run;
}

async function seed(): Promise<DB> {
  const db: DB = structuredClone(EMPTY);
  try {
    const posts = JSON.parse(await fs.readFile(path.join(DATA_DIR, "seed-posts.json"), "utf8"));
    db.posts = posts;
  } catch {
    db.posts = [];
  }
  return db;
}

export function emptyReactions(): Record<ReactionType, string[]> {
  return { naruhodo: [], kizuki: [], ikitai: [], umasou: [] };
}

export function reactionCount(p: Post): number {
  return Object.values(p.reactions).reduce((n, list) => n + list.length, 0);
}

/** 外部APIの結果を ttlMs の間キャッシュする。失敗時は古いキャッシュがあればそれを返す */
export async function cached<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<T> {
  const hit = (await readDB()).sourceCache[key];
  if (hit && Date.now() - Date.parse(hit.fetchedAt) < ttlMs) return hit.data as T;
  try {
    const data = await fetcher();
    await updateDB((db) => {
      db.sourceCache[key] = { data, fetchedAt: new Date().toISOString() };
    });
    return data;
  } catch (err) {
    if (hit) return hit.data as T;
    throw err;
  }
}
