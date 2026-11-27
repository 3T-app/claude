import { distanceM } from "../areas";

// Google Places API（New）の Text Search。食べログには公式の公開APIがないため、
// 店の評価（★）・口コミの数・価格帯は Google マップのデータで見る。
// 規約上、Google マップのデータは保存（長期のキャッシュ）しない：プロセスの中で数時間だけ使い回し、ファイルには書かない。
// 料金：評価・口コミ数・価格帯は Text Search の Enterprise の項目（毎月の無料枠あり。超えると有料）

const API = "https://places.googleapis.com/v1/places:searchText";
const FIELDS = [
  "places.id",
  "places.displayName",
  "places.rating",
  "places.userRatingCount",
  "places.priceLevel",
  "places.location",
  "places.primaryTypeDisplayName",
].join(",");
const HOUR = 60 * 60 * 1000;

// アプリの業態 → Google マップで探す言葉
const QUERIES: Record<string, string> = {
  "カフェ・喫茶": "カフェ",
  "スイーツ・ベーカリー": "スイーツ",
  "ラーメン・つけ麺": "ラーメン",
  "居酒屋・バー": "居酒屋",
  "定食・食堂": "定食",
  "焼肉・ホルモン": "焼肉",
  "寿司・和食": "寿司",
  "イタリアン・フレンチ": "イタリアン",
  "アジア・エスニック": "エスニック料理",
  "テイクアウト・総菜": "テイクアウト",
  その他: "飲食店",
};

const PRICE: Record<string, string> = {
  PRICE_LEVEL_FREE: "無料",
  PRICE_LEVEL_INEXPENSIVE: "安い",
  PRICE_LEVEL_MODERATE: "ふつう",
  PRICE_LEVEL_EXPENSIVE: "やや高め",
  PRICE_LEVEL_VERY_EXPENSIVE: "高い",
};

export interface RatedShop {
  name: string;
  rating: number | null;
  reviews: number;
  price: string | null;
  distanceM: number;
  type: string;
}

export interface PlacesSummary {
  query: string;
  radiusM: number;
  shops: RatedShop[];
  /** 口コミの数で重みをつけた平均の評価 */
  avgRating: number | null;
  medianReviews: number;
  /** 価格帯ごとの店の数 */
  prices: Record<string, number>;
}

export function placesEnabled() {
  return !!process.env.GOOGLE_PLACES_API_KEY;
}

// 同じ場所・業態を何度も調べないための、プロセスの中だけの短い使い回し（ファイルには保存しない）
const memo = new Map<string, { at: number; data: PlacesSummary }>();

async function searchText(body: Record<string, unknown>) {
  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": process.env.GOOGLE_PLACES_API_KEY!.trim(), "X-Goog-FieldMask": FIELDS },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => null);
    throw new Error(`Google Places API ${res.status}${j?.error?.message ? `：${j.error.message}` : ""}`);
  }
  return (await res.json()) as {
    places?: {
      id: string;
      displayName?: { text: string };
      rating?: number;
      userRatingCount?: number;
      priceLevel?: string;
      location?: { latitude: number; longitude: number };
      primaryTypeDisplayName?: { text: string };
    }[];
  };
}

/** 店のまわり（半径 radiusM）の同じ業態の店の評価・口コミの数・価格帯 */
export async function ratedShopsAround(lat: number, lng: number, genre: string, radiusM = 500): Promise<PlacesSummary | null> {
  if (!placesEnabled()) return null;
  const query = QUERIES[genre] ?? QUERIES["その他"];
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}:${query}:${radiusM}`;
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < 6 * HOUR) return hit.data;

  const json = await searchText({
    textQuery: query,
    languageCode: "ja",
    regionCode: "JP",
    maxResultCount: 20,
    locationBias: { circle: { center: { latitude: lat, longitude: lng }, radius: radiusM } },
  });
  const shops: RatedShop[] = (json.places ?? [])
    .filter((p) => p.location)
    .map((p) => ({
      name: p.displayName?.text ?? "",
      rating: p.rating ?? null,
      reviews: p.userRatingCount ?? 0,
      price: p.priceLevel ? PRICE[p.priceLevel] ?? null : null,
      distanceM: Math.round(distanceM(lat, lng, p.location!.latitude, p.location!.longitude)),
      type: p.primaryTypeDisplayName?.text ?? "",
    }))
    // locationBias は範囲の外の店も返すので、半径の1.5倍までに絞る
    .filter((s) => s.distanceM <= radiusM * 1.5)
    .sort((a, b) => b.reviews - a.reviews);

  const rated = shops.filter((s) => s.rating !== null && s.reviews > 0);
  const weight = rated.reduce((n, s) => n + s.reviews, 0);
  const avgRating = weight ? Math.round((rated.reduce((n, s) => n + s.rating! * s.reviews, 0) / weight) * 100) / 100 : null;
  const sortedReviews = shops.map((s) => s.reviews).sort((a, b) => a - b);
  const medianReviews = sortedReviews.length ? sortedReviews[Math.floor(sortedReviews.length / 2)] : 0;
  const prices: Record<string, number> = {};
  for (const s of shops) if (s.price) prices[s.price] = (prices[s.price] ?? 0) + 1;

  const data = { query, radiusM, shops, avgRating, medianReviews, prices };
  memo.set(key, { at: Date.now(), data });
  return data;
}

export function formatPlaces(p: PlacesSummary | null): string {
  if (!p) return "（Google マップのデータなし）";
  if (p.shops.length === 0) return `半径${p.radiusM}m以内に「${p.query}」の店は見つかりませんでした`;
  const prices = Object.entries(p.prices)
    .map(([k, n]) => `${k}${n}軒`)
    .join("・");
  return [
    `半径${p.radiusM}m前後の「${p.query}」の店：${p.shops.length}軒（口コミで重みをつけた平均の評価 ${p.avgRating ?? "なし"}、口コミの数の中央値 ${p.medianReviews}件${prices ? `、価格帯 ${prices}` : ""}）`,
    ...p.shops.slice(0, 10).map((s) => `- ${s.name}（約${s.distanceM}m、★${s.rating ?? "なし"}、口コミ${s.reviews}件${s.price ? `、${s.price}` : ""}）`),
  ].join("\n");
}

/** 接続テスト（1回だけ検索） */
export async function testPlaces(): Promise<string> {
  const json = await searchText({ textQuery: "池袋 カフェ", languageCode: "ja", regionCode: "JP", maxResultCount: 1 });
  const p = json.places?.[0];
  return p ? `検索OK：${p.displayName?.text ?? ""}（★${p.rating ?? "なし"}・口コミ${p.userRatingCount ?? 0}件）` : "検索OK（結果0件）";
}
