import { distanceM } from "../areas";
import { readDB, updateDB } from "../store";

// Tripadvisor（トリップアドバイザー）Content API。食べログの代わりに、観光地・訪日客に強い評価と口コミの数を出す。
// 無料の範囲で使うための決まり：
//   - 1回の立地調査で、近くの店の検索1回＋上位の店の詳細を最大 DETAIL_LIMIT 回だけ呼ぶ
//   - 呼び出した回数を月ごとに数え、TRIPADVISOR_MONTHLY_LIMIT（既定 900回）に達したらその月は呼ばない
// 規約に沿って：データは保存しない（場所のID以外は保存・キャッシュ禁止）／画面に Tripadvisor の表示（評価の画像・リンク）を出す／
//   AIの分析には渡さない（AIでの利用は別の契約が必要とされているため）

const DEFAULT_BASE = "https://api.content.tripadvisor.com/api/v1";
const DETAIL_LIMIT = 4;
const DEFAULT_MONTHLY_LIMIT = 900;

export interface TripadvisorShop {
  name: string;
  rating: number | null;
  reviews: number;
  price: string | null;
  ranking: string | null;
  cuisines: string[];
  distanceM: number | null;
  url: string | null;
  ratingImage: string | null;
}

export interface TripadvisorSummary {
  shops: TripadvisorShop[];
  /** 近くで見つかった店の数（詳細を取ったのはその一部） */
  found: number;
  /** 今月使った回数と上限 */
  usage: { used: number; limit: number };
  /** 今月の上限に達して呼ばなかった */
  limited: boolean;
}

export function tripadvisorEnabled() {
  return !!process.env.TRIPADVISOR_API_KEY;
}

function monthlyLimit() {
  const n = Number(process.env.TRIPADVISOR_MONTHLY_LIMIT);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MONTHLY_LIMIT;
}

const monthKey = () => `tripadvisor:${new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 7)}`;

/** 今月の呼び出し回数（回数だけを数える。中身は保存しない） */
export async function tripadvisorUsage(): Promise<{ used: number; limit: number }> {
  return { used: (await readDB()).apiUsage[monthKey()] ?? 0, limit: monthlyLimit() };
}

/** 上限の中なら回数を1つ数えて true。上限なら false */
async function take(): Promise<boolean> {
  const limit = monthlyLimit();
  return updateDB((db) => {
    const k = monthKey();
    const used = db.apiUsage[k] ?? 0;
    if (used >= limit) return false;
    db.apiUsage[k] = used + 1;
    // 古い月の回数は消す
    for (const key of Object.keys(db.apiUsage)) if (key.startsWith("tripadvisor:") && key !== k) delete db.apiUsage[key];
    return true;
  });
}

async function get(path: string, params: Record<string, string>) {
  const base = (process.env.TRIPADVISOR_API_BASE || DEFAULT_BASE).replace(/\/$/, "");
  const qs = new URLSearchParams({ ...params, key: process.env.TRIPADVISOR_API_KEY!.trim() });
  const res = await fetch(`${base}${path}?${qs}`, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(10000) });
  if (!res.ok) {
    const j = await res.json().catch(() => null);
    throw new Error(`Tripadvisor API ${res.status}${j?.error?.message ? `：${j.error.message}` : j?.message ? `：${j.message}` : ""}`);
  }
  return res.json();
}

interface Details {
  name?: string;
  web_url?: string;
  rating?: string;
  num_reviews?: string;
  price_level?: string;
  rating_image_url?: string;
  latitude?: string;
  longitude?: string;
  ranking_data?: { ranking_string?: string };
  cuisine?: { localized_name?: string; name?: string }[];
}

/** 店のまわりのレストランの評価・口コミの数（近い店から最大 DETAIL_LIMIT 軒）。保存しない */
export async function tripadvisorAround(lat: number, lng: number, radiusM = 500): Promise<TripadvisorSummary | null> {
  if (!tripadvisorEnabled()) return null;
  if (!(await take())) return { shops: [], found: 0, usage: await tripadvisorUsage(), limited: true };
  const near = (await get("/location/nearby_search", {
    latLong: `${lat},${lng}`,
    category: "restaurants",
    radius: String(radiusM),
    radiusUnit: "m",
    language: "ja",
  })) as { data?: { location_id: string; name: string }[] };
  const list = near.data ?? [];
  const shops: TripadvisorShop[] = [];
  for (const loc of list.slice(0, DETAIL_LIMIT)) {
    if (!(await take())) break;
    const d = (await get(`/location/${encodeURIComponent(loc.location_id)}/details`, { language: "ja", currency: "JPY" }).catch(() => null)) as Details | null;
    if (!d) continue;
    const la = Number(d.latitude);
    const lo = Number(d.longitude);
    shops.push({
      name: d.name ?? loc.name,
      rating: d.rating ? Number(d.rating) : null,
      reviews: Number(d.num_reviews ?? 0),
      price: d.price_level ?? null,
      ranking: d.ranking_data?.ranking_string ?? null,
      cuisines: (d.cuisine ?? []).map((c) => c.localized_name ?? c.name ?? "").filter(Boolean).slice(0, 3),
      distanceM: Number.isFinite(la) && Number.isFinite(lo) ? Math.round(distanceM(lat, lng, la, lo)) : null,
      url: d.web_url ?? null,
      ratingImage: d.rating_image_url ?? null,
    });
  }
  return { shops: shops.sort((a, b) => b.reviews - a.reviews), found: list.length, usage: await tripadvisorUsage(), limited: false };
}

/** 接続テスト（近くの店の検索を1回） */
export async function testTripadvisor(): Promise<string> {
  if (!(await take())) {
    const u = await tripadvisorUsage();
    return `今月の上限（${u.limit}回）に達しているため、テストの呼び出しをしませんでした`;
  }
  const r = (await get("/location/nearby_search", { latLong: "35.7295,139.7109", category: "restaurants", radius: "300", radiusUnit: "m", language: "ja" })) as {
    data?: { name: string }[];
  };
  const u = await tripadvisorUsage();
  return `検索OK：${r.data?.[0]?.name ?? "結果0件"}（今月 ${u.used}／${u.limit}回）`;
}
