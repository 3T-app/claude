import { promises as fs } from "fs";
import path from "path";
import { z } from "zod";
import { DATA_DIR } from "./store";

// Claude Code の /crawl-news が毎日書き出すニュース（data/news/）。
//   areas/<id>.json … 街の変化（開業・閉店・再開発など）
//   buzz.json       … いま話題の食べ物・お店（業態ごと）

export const AREA_NEWS_KINDS = ["開業", "閉店", "再開発", "イベント", "話題の店", "その他"] as const;

const item = z.object({
  date: z.string(),
  title: z.string(),
  url: z.string(),
  source: z.string(),
  summary: z.string(),
});

export const areaNewsValidator = z.object({
  areaId: z.string(),
  updatedAt: z.string(),
  items: z.array(item.extend({ kind: z.enum(AREA_NEWS_KINDS), impact: z.string() })),
});
export type AreaNews = z.infer<typeof areaNewsValidator>;
export type AreaNewsItem = AreaNews["items"][number];

export const buzzValidator = z.object({
  updatedAt: z.string(),
  items: z.array(item.extend({ genre: z.string(), why: z.string(), areaId: z.string().optional() })),
});
export type BuzzItem = z.infer<typeof buzzValidator>["items"][number];

async function readJSON<T>(file: string, v: z.ZodType<T>): Promise<T | null> {
  try {
    const parsed = v.safeParse(JSON.parse(await fs.readFile(path.join(DATA_DIR, "news", file), "utf8")));
    if (!parsed.success) {
      console.warn(`[news] ${file} の形式が不正です`, parsed.error.issues[0]);
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

const newestFirst = <T extends { date: string }>(a: T, b: T) => b.date.localeCompare(a.date);

/** 街のニュース（新しい順、直近60日） */
export async function readAreaNews(areaId: string, limit = 8): Promise<AreaNewsItem[]> {
  if (!/^[a-z0-9-]+$/.test(areaId)) return [];
  const n = await readJSON(`areas/${areaId}.json`, areaNewsValidator);
  const since = new Date(Date.now() - 60 * 864e5).toISOString().slice(0, 10);
  return (n?.items ?? []).filter((i) => i.date >= since).sort(newestFirst).slice(0, limit);
}

/** 話題の食べ物・お店（その業態と「全般」、直近30日） */
export async function readBuzz(genre: string, limit = 8): Promise<BuzzItem[]> {
  const n = await readJSON("buzz.json", buzzValidator);
  const since = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  return (n?.items ?? [])
    .filter((i) => (i.genre === genre || i.genre === "全般") && i.date >= since)
    .sort(newestFirst)
    .slice(0, limit);
}

export function formatAreaNews(items: AreaNewsItem[]): string {
  if (items.length === 0) return "（直近のニュースはありません）";
  return items.map((i) => `- [${i.date}｜${i.kind}] ${i.title}（${i.source}）：${i.summary} → ${i.impact}`).join("\n");
}

export function formatBuzz(items: BuzzItem[]): string {
  if (items.length === 0) return "（直近の話題はありません）";
  return items.map((i) => `- [${i.date}｜${i.genre}] ${i.title}（${i.source}）：${i.summary}（話題の理由：${i.why}）`).join("\n");
}
