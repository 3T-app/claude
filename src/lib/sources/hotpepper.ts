import { distanceM } from "../areas";
import { cached } from "../store";

// ホットペッパーグルメ Webサービス（無料・メール登録のみ）
// 利用時は画面にクレジット表記が必要（HotPepperCredit コンポーネント）。

const API = "https://webservice.recruit.co.jp/hotpepper";
const DAY = 24 * 60 * 60 * 1000;

// range：1=300m 2=500m 3=1000m 4=2000m 5=3000m
type Range = 1 | 2 | 3;

// アプリの業態 → ホットペッパーのジャンル名に含まれる言葉。コードはジャンル一覧APIから名前で引く
const GENRE_KEYWORDS: Record<string, string | null> = {
  "カフェ・喫茶": "カフェ",
  "スイーツ・ベーカリー": "スイーツ",
  "ラーメン・つけ麺": "ラーメン",
  "居酒屋・バー": "居酒屋",
  "定食・食堂": "和食",
  "焼肉・ホルモン": "焼肉",
  "寿司・和食": "和食",
  "イタリアン・フレンチ": "イタリアン",
  "アジア・エスニック": "アジア",
  "テイクアウト・総菜": null,
  "その他": null,
};

interface Shop {
  name: string;
  lat: string | number;
  lng: string | number;
  genre?: { code: string; name: string };
  budget?: { name?: string; average?: string };
  catch?: string;
  urls?: { pc?: string };
}

export interface NearbyShop {
  name: string;
  genre: string;
  budget: string;
  distance: number;
  url: string;
}

export interface Competition {
  genreName: string | null;
  sameGenre300: number | null;
  sameGenre1000: number | null;
  all300: number;
  all500: number;
  genreMix: { genre: string; count: number }[];
  nearest: NearbyShop[];
}

export interface Composition {
  total: number;
  genreMix: { genre: string; count: number }[];
  budgetMix: { budget: string; count: number }[];
}

export function hotpepperEnabled() {
  return !!process.env.HOTPEPPER_API_KEY;
}

async function call(path: string, params: Record<string, string | number>) {
  const qs = new URLSearchParams({ key: process.env.HOTPEPPER_API_KEY!, format: "json" });
  for (const [k, v] of Object.entries(params)) qs.set(k, String(v));
  const res = await fetch(`${API}/${path}/v1/?${qs}`, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`HotPepper API ${res.status}`);
  const json = await res.json();
  if (json.results?.error) throw new Error(`HotPepper API: ${JSON.stringify(json.results.error)}`);
  return json.results;
}

async function genreCode(appGenre: string): Promise<{ code: string; name: string } | null> {
  const keyword = GENRE_KEYWORDS[appGenre];
  if (!keyword) return null;
  const master = await cached("hotpepper:genres", 30 * DAY, async () => {
    const r = await call("genre", {});
    return (r.genre ?? []) as { code: string; name: string }[];
  });
  return master.find((g) => g.name.includes(keyword)) ?? null;
}

async function count(lat: number, lng: number, range: Range, genre?: string): Promise<number> {
  const r = await call("gourmet", { lat, lng, range, count: 1, ...(genre ? { genre } : {}) });
  return Number(r.results_available ?? 0);
}

/** 件数（results_available）と、先頭100件までの店 */
async function list(lat: number, lng: number, range: Range): Promise<{ available: number; shops: Shop[] }> {
  const r = await call("gourmet", { lat, lng, range, count: 100 });
  return { available: Number(r.results_available ?? 0), shops: (r.shop ?? []) as Shop[] };
}

function tally<T extends string>(items: T[]) {
  const m = new Map<T, number>();
  for (const i of items) m.set(i, (m.get(i) ?? 0) + 1);
  return [...m].sort((a, b) => b[1] - a[1]);
}

const round = (n: number) => n.toFixed(4);

/** 立地調査用：同業の数と、周りにどんな店があるか。7日キャッシュ */
export async function competition(lat: number, lng: number, appGenre: string): Promise<Competition | null> {
  if (!hotpepperEnabled()) return null;
  return cached(`hotpepper:comp:${round(lat)},${round(lng)}:${appGenre}`, 7 * DAY, async () => {
    const g = await genreCode(appGenre);
    const [sameGenre300, sameGenre1000, all300, { available, shops }] = await Promise.all([
      g ? count(lat, lng, 1, g.code) : Promise.resolve(null),
      g ? count(lat, lng, 3, g.code) : Promise.resolve(null),
      count(lat, lng, 1),
      list(lat, lng, 2),
    ]);
    const nearest = shops
      .map((s) => ({
        name: s.name,
        genre: s.genre?.name ?? "",
        budget: s.budget?.name ?? "",
        distance: Math.round(distanceM(lat, lng, Number(s.lat), Number(s.lng))),
        url: s.urls?.pc ?? "",
      }))
      .sort((a, b) => a.distance - b.distance);
    return {
      genreName: g?.name ?? null,
      sameGenre300,
      sameGenre1000,
      all300,
      all500: available,
      genreMix: tally(nearest.map((s) => s.genre).filter(Boolean)).map(([genre, count]) => ({ genre, count })),
      nearest: nearest.slice(0, 15),
    };
  });
}

/** 講義用：街の中心500m以内の店の構成。7日キャッシュ */
export async function composition(lat: number, lng: number): Promise<Composition | null> {
  if (!hotpepperEnabled()) return null;
  return cached(`hotpepper:mix:${round(lat)},${round(lng)}`, 7 * DAY, async () => {
    const { available, shops } = await list(lat, lng, 2);
    return {
      total: available,
      genreMix: tally(shops.map((s) => s.genre?.name ?? "").filter(Boolean)).map(([genre, count]) => ({ genre, count })),
      budgetMix: tally(shops.map((s) => s.budget?.name ?? "").filter(Boolean)).map(([budget, count]) => ({ budget, count })),
    };
  });
}

export function formatCompetition(c: Competition | null, appGenre: string): string {
  if (!c) return "（ホットペッパーのデータなし）";
  const lines = [
    c.genreName
      ? `- 同業（${c.genreName}）：半径300m以内 ${c.sameGenre300}軒、半径1km以内 ${c.sameGenre1000}軒`
      : `- 同業：業態「${appGenre}」はホットペッパーのジャンルに対応しないため件数なし`,
    `- 全ジャンルの飲食店：半径300m以内 ${c.all300}軒、半径500m以内 ${c.all500}軒`,
    `- 半径500m以内のジャンル構成（取得した最大100軒から集計）：${c.genreMix.map((g) => `${g.genre}${g.count}`).join("、")}`,
    `- 近い店：${c.nearest
      .slice(0, 10)
      .map((s) => `${s.name}（${s.genre}、${s.budget || "予算不明"}、${s.distance}m）`)
      .join("、")}`,
  ];
  return lines.join("\n");
}

export function formatComposition(c: Composition | null): string {
  if (!c) return "（ホットペッパーのデータなし）";
  return [
    `- 中心から半径500m以内の掲載店：${c.total}軒`,
    `- ジャンル構成（最大100軒から集計）：${c.genreMix.map((g) => `${g.genre}${g.count}`).join("、")}`,
    `- ディナー予算の分布：${c.budgetMix.map((b) => `${b.budget}：${b.count}`).join("、")}`,
  ].join("\n");
}

/** 接続テスト：池袋駅周辺300mの店の数 */
export async function testHotPepper(): Promise<string> {
  const n = await count(35.7295, 139.7109, 1);
  const g = await genreCode("カフェ・喫茶");
  return `池袋駅300m以内 ${n}軒／ジャンル「カフェ」のコード ${g?.code ?? "見つからず"}`;
}
