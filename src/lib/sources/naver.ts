import { promises as fs } from "fs";
import path from "path";
import { cached, DATA_DIR } from "../store";

// Naver DataLab 検索語トレンド（韓国の検索の伸び）。日本の流行は韓国で先に流行ったものが多いので、先取りの材料にする。
// 2つのキーのどちらかで動く：
//   新しい NAVER API HUB（NCP コンソールで発行）：NCP_APIGW_API_KEY_ID ／ NCP_APIGW_API_KEY
//   これまでの Naver Developers のアプリ：NAVER_CLIENT_ID ／ NAVER_CLIENT_SECRET
// 見る言葉は data/global-watch.json（業態ごとに最大5グループ）。

const HUB_URL = "https://naverapihub.apigw.ntruss.com/search-trend/v1/search";
const LEGACY_URL = "https://openapi.naver.com/v1/datalab/search";
const DAY = 24 * 60 * 60 * 1000;

interface Group {
  groupName: string;
  keywords: string[];
}

export interface KoreaTrend {
  /** 日本語の名前 */
  name: string;
  keywords: string[];
  /** 直近4週の平均（このリクエストの中で一番多い週を100とした値） */
  recent: number;
  /** その前の12週の平均 */
  before: number;
  /** 増減の割合（before が 0 のときは null） */
  changePct: number | null;
}

export function naverEnabled() {
  return !!(process.env.NCP_APIGW_API_KEY_ID && process.env.NCP_APIGW_API_KEY) || !!(process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET);
}

/** どのキーを使うか（接続テストの表示用） */
export function naverKeyNames(): [string, string] {
  return process.env.NCP_APIGW_API_KEY_ID ? ["NCP_APIGW_API_KEY_ID", "NCP_APIGW_API_KEY"] : ["NAVER_CLIENT_ID", "NAVER_CLIENT_SECRET"];
}

async function readWatch(): Promise<Record<string, Group[]>> {
  try {
    const j = JSON.parse(await fs.readFile(path.join(DATA_DIR, "global-watch.json"), "utf8")) as { genres?: Record<string, Group[]> };
    return j.genres ?? {};
  } catch {
    return {};
  }
}

const day = (d: Date) => d.toISOString().slice(0, 10);

async function post(groups: Group[], weeks = 16) {
  const end = new Date(Date.now() - DAY);
  const start = new Date(end.getTime() - weeks * 7 * DAY);
  const hub = !!process.env.NCP_APIGW_API_KEY_ID;
  const url = process.env.NAVER_DATALAB_URL || (hub ? HUB_URL : LEGACY_URL);
  const headers: Record<string, string> = hub
    ? { "X-NCP-APIGW-API-KEY-ID": process.env.NCP_APIGW_API_KEY_ID!.trim(), "X-NCP-APIGW-API-KEY": process.env.NCP_APIGW_API_KEY!.trim() }
    : { "X-Naver-Client-Id": process.env.NAVER_CLIENT_ID!.trim(), "X-Naver-Client-Secret": process.env.NAVER_CLIENT_SECRET!.trim() };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({
      startDate: day(start),
      endDate: day(end),
      timeUnit: "week",
      keywordGroups: groups.slice(0, 5).map((g) => ({ groupName: g.groupName, keywords: g.keywords.slice(0, 20) })),
    }),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => null);
    throw new Error(`Naver DataLab ${res.status}${j?.errorMessage ? `：${j.errorMessage}` : j?.error?.message ? `：${j.error.message}` : ""}`);
  }
  return (await res.json()) as { results?: { title: string; keywords: string[]; data: { period: string; ratio: number }[] }[] };
}

/** 業態の言葉の、韓国での検索の伸び（直近4週とその前の12週）。3日キャッシュ */
export async function koreaTrends(genre: string): Promise<KoreaTrend[]> {
  if (!naverEnabled()) return [];
  const watch = await readWatch();
  const groups = watch[genre]?.length ? watch[genre] : watch["全般"] ?? [];
  if (!groups.length) return [];
  return cached(`naver:${genre}:${groups.map((g) => g.groupName).join(",")}`, 3 * DAY, async () => {
    const json = await post(groups);
    return (json.results ?? [])
      .map((r) => {
        const v = r.data.map((d) => d.ratio);
        const avg = (a: number[]) => (a.length ? a.reduce((n, x) => n + x, 0) / a.length : 0);
        const recent = avg(v.slice(-4));
        const before = avg(v.slice(0, -4));
        return {
          name: r.title,
          keywords: r.keywords,
          recent: Math.round(recent * 10) / 10,
          before: Math.round(before * 10) / 10,
          changePct: before > 0 ? Math.round(((recent - before) / before) * 100) : null,
        };
      })
      .sort((a, b) => (b.changePct ?? 0) - (a.changePct ?? 0));
  });
}

export function formatKoreaTrends(list: KoreaTrend[]): string {
  if (list.length === 0) return "（韓国の検索トレンドのデータなし）";
  return list
    .map((t) => `- ${t.name}（${t.keywords.join("・")}）：直近4週 ${t.recent}／その前 ${t.before}${t.changePct === null ? "" : `（${t.changePct >= 0 ? "+" : ""}${t.changePct}%）`}`)
    .join("\n");
}

/** 接続テスト（1回だけ検索） */
export async function testNaver(): Promise<string> {
  const json = await post([{ groupName: "テスト", keywords: ["라멘"] }], 4);
  const n = json.results?.[0]?.data?.length ?? 0;
  return `検索トレンドOK：${n}週分のデータ（${process.env.NCP_APIGW_API_KEY_ID ? "NAVER API HUB" : "Naver Developers"}）`;
}
