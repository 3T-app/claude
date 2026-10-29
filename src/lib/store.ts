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

interface DB {
  posts: Post[];
  trends: Record<string, TrendCache>;
  lectures: Record<string, { data: unknown; postCount: number; createdAt: string }>;
  chatUsage: Record<string, number>;
  teachings: string;
}

const EMPTY: DB = { posts: [], trends: {}, lectures: {}, chatUsage: {}, teachings: "" };

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
    db.teachings = await fs.readFile(path.join(DATA_DIR, "teachings.md"), "utf8");
  } catch {
    db.teachings = "";
  }
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
