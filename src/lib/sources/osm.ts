import { distanceM } from "../areas";
import { cached } from "../store";

// OpenStreetMap（Overpass API。無料・登録不要）から、地図上の店や施設の位置を取る。
// 地図の表示は国土地理院、店の位置データは OpenStreetMap を使う（表示時に出典の明記が必要）。

const ENDPOINTS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
const DAY = 24 * 60 * 60 * 1000;

export const POI_CATEGORIES = [
  "アニメ・ホビー",
  "家電",
  "釣具・アウトドア",
  "飲食",
  "カフェ・甘味",
  "夜の店",
  "娯楽",
  "ファッション・物販",
  "生活",
  "観光・文化",
] as const;
export type PoiCategory = (typeof POI_CATEGORIES)[number];

export interface Poi {
  id: string;
  name: string;
  category: PoiCategory;
  kind: string;
  lat: number;
  lng: number;
}

type Tags = Record<string, string>;

// 名前でしか判別できないチェーン（OSMのタグが一般的な shop=books などになっている店）
const NAME_RULES: [RegExp, PoiCategory][] = [
  [/アニメイト|K-BOOKS|ケイブックス|駿河屋|らしんばん|まんだらけ|メロンブックス|とらのあな|ガチャ|ガシャポン|gashacoco|ポケモンセンター|ジャンプショップ|麦わらストア|ゲーマーズ|ボークス|イエローサブマリン/i, "アニメ・ホビー"],
  [/ヨドバシ|ビックカメラ|ヤマダ|ノジマ|エディオン|ケーズデンキ|ソフマップ|ドスパラ/, "家電"],
  [/釣具|フィッシング|キャスティング|上州屋|かめや/, "釣具・アウトドア"],
  [/スナック|ホスト|キャバ|ラウンジ/, "夜の店"],
  [/パチンコ|パチスロ|スロット|ネットカフェ|まんが喫茶|漫画喫茶|カラオケ|シネマ|映画/, "娯楽"],
  [/サーティワン|31アイス|Baskin|アイスクリーム|ジェラート|クレープ|ベローチェ|タリーズ|ドトール|スターバックス|コメダ/, "カフェ・甘味"],
];

function categorize(t: Tags): { category: PoiCategory; kind: string } | null {
  const name = t.name ?? "";
  for (const [re, cat] of NAME_RULES) if (re.test(name)) return { category: cat, kind: t.shop ?? t.amenity ?? t.leisure ?? "" };

  const shop = t.shop;
  const amenity = t.amenity;
  const leisure = t.leisure;
  if (shop) {
    if (/^(anime|games|video_games|toys|model|collector|trade|frame|music)$/.test(shop)) return { category: "アニメ・ホビー", kind: shop };
    if (/^(electronics|computer|mobile_phone|hifi|camera|appliance)$/.test(shop)) return { category: "家電", kind: shop };
    if (/^(fishing|outdoor|hunting|sports)$/.test(shop)) return { category: "釣具・アウトドア", kind: shop };
    if (/^(confectionery|pastry|bakery|ice_cream|chocolate|tea|coffee)$/.test(shop)) return { category: "カフェ・甘味", kind: shop };
    if (/^(supermarket|convenience|chemist|pharmacy|greengrocer|butcher|alcohol|hardware|laundry|dry_cleaning|hairdresser|beauty)$/.test(shop)) return { category: "生活", kind: shop };
    return { category: "ファッション・物販", kind: shop };
  }
  if (amenity) {
    if (/^(cafe|ice_cream)$/.test(amenity)) return { category: "カフェ・甘味", kind: amenity };
    if (/^(restaurant|fast_food|food_court)$/.test(amenity)) return { category: "飲食", kind: t.cuisine ? `${amenity}:${t.cuisine}` : amenity };
    if (/^(bar|pub|nightclub|stripclub|love_hotel)$/.test(amenity)) return { category: "夜の店", kind: amenity };
    if (/^(cinema|karaoke_box|gambling|casino|internet_cafe|theatre|arts_centre)$/.test(amenity)) return { category: "娯楽", kind: amenity };
  }
  if (leisure && /^(amusement_arcade|adult_gaming_centre|bowling_alley)$/.test(leisure)) return { category: "娯楽", kind: leisure };
  if (t.tourism && /^(attraction|museum|gallery|aquarium)$/.test(t.tourism)) return { category: "観光・文化", kind: t.tourism };
  return null;
}

function query(lat: number, lng: number, radius: number): string {
  const a = `(around:${radius},${lat},${lng})`;
  return `[out:json][timeout:40];
(
  nwr${a}[shop][name];
  nwr${a}[amenity~"^(restaurant|fast_food|food_court|cafe|ice_cream|bar|pub|nightclub|cinema|karaoke_box|gambling|casino|internet_cafe|theatre|arts_centre)$"][name];
  nwr${a}[leisure~"^(amusement_arcade|adult_gaming_centre|bowling_alley)$"][name];
  nwr${a}[tourism~"^(attraction|museum|gallery|aquarium)$"][name];
);
out center tags 3000;`;
}

async function overpass(q: string) {
  let last: unknown;
  for (const url of ENDPOINTS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "shoken-unchiku/0.1" },
        body: "data=" + encodeURIComponent(q),
        signal: AbortSignal.timeout(45000),
      });
      if (!res.ok) throw new Error(`Overpass ${res.status}`);
      return (await res.json()) as {
        elements: { type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Tags }[];
      };
    } catch (err) {
      last = err;
    }
  }
  throw last;
}

/** 中心から radius m 以内の店・施設。14日キャッシュ */
export async function poisAround(lat: number, lng: number, radius: number): Promise<Poi[]> {
  if (process.env.OSM_DISABLED === "1") return [];
  return cached(`osm:${lat.toFixed(4)},${lng.toFixed(4)}:${radius}`, 14 * DAY, async () => {
    const json = await overpass(query(lat, lng, radius));
    const seen = new Set<string>();
    const pois: Poi[] = [];
    for (const e of json.elements) {
      const t = e.tags ?? {};
      const la = e.lat ?? e.center?.lat;
      const lo = e.lon ?? e.center?.lon;
      if (la === undefined || lo === undefined || !t.name) continue;
      const c = categorize(t);
      if (!c) continue;
      // 同じ建物に重複して登録されているものを1つにまとめる
      const key = `${t.name}@${la.toFixed(4)},${lo.toFixed(4)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pois.push({ id: `${e.type[0]}${e.id}`, name: t.name, category: c.category, kind: c.kind, lat: la, lng: lo });
    }
    return pois;
  });
}

/** AIに渡す一覧。カテゴリごとの件数と、店の一覧（id・座標つき）。数が多いときは珍しいカテゴリを優先して残す */
export function formatPois(pois: Poi[], center: { lat: number; lng: number }, limit = 320): string {
  if (pois.length === 0) return "（地図の店舗データなし）";
  const counts = new Map<PoiCategory, number>();
  for (const p of pois) counts.set(p.category, (counts.get(p.category) ?? 0) + 1);

  // 飲食・物販・生活は多いので、中心に近いものから間引く
  const common: PoiCategory[] = ["飲食", "ファッション・物販", "生活"];
  const byDist = [...pois].sort(
    (a, b) => distanceM(center.lat, center.lng, a.lat, a.lng) - distanceM(center.lat, center.lng, b.lat, b.lng),
  );
  const rare = byDist.filter((p) => !common.includes(p.category));
  const rest = byDist.filter((p) => common.includes(p.category));
  const picked = [...rare, ...rest].slice(0, limit);

  const lines = [
    `カテゴリ別の件数：${POI_CATEGORIES.filter((c) => counts.get(c))
      .map((c) => `${c}${counts.get(c)}`)
      .join("、")}（合計${pois.length}）`,
    `一覧（id｜カテゴリ｜名前｜種類｜緯度,経度）${picked.length < pois.length ? `※${pois.length}件中${picked.length}件` : ""}`,
    ...picked.map((p) => `${p.id}｜${p.category}｜${p.name}｜${p.kind}｜${p.lat.toFixed(5)},${p.lng.toFixed(5)}`),
  ];
  return lines.join("\n");
}

/** 店から近い順に、カテゴリごとの近隣施設（立地調査用） */
export function nearbyByCategory(pois: Poi[], lat: number, lng: number, perCategory = 4) {
  const withD = pois
    .map((p) => ({ ...p, distance: Math.round(distanceM(lat, lng, p.lat, p.lng)) }))
    .sort((a, b) => a.distance - b.distance);
  return POI_CATEGORIES.map((c) => ({ category: c, items: withD.filter((p) => p.category === c).slice(0, perCategory) })).filter(
    (g) => g.items.length > 0,
  );
}

export interface StationExit {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

/** 駅の出入口（OpenStreetMap の railway=subway_entrance / train_station_entrance など）。30日キャッシュ */
export async function stationExits(lat: number, lng: number, radius = 700): Promise<StationExit[]> {
  if (process.env.OSM_DISABLED === "1") return [];
  return cached(`osm-exits:${lat.toFixed(4)},${lng.toFixed(4)}:${radius}`, 30 * DAY, async () => {
    const a = `(around:${radius},${lat},${lng})`;
    const json = await overpass(`[out:json][timeout:30];
(
  node${a}[railway~"^(subway_entrance|train_station_entrance)$"];
  node${a}[public_transport=entrance];
  node${a}[entrance][railway];
);
out tags 300;`);
    const exits: StationExit[] = [];
    for (const e of json.elements) {
      const t = e.tags ?? {};
      if (e.lat === undefined || e.lon === undefined) continue;
      const name = [t["name:ja"] ?? t.name, t.ref && !(t.name ?? "").includes(t.ref) ? t.ref : ""].filter(Boolean).join(" ");
      exits.push({ id: `n${e.id}`, name: name || "出入口", lat: e.lat, lng: e.lon });
    }
    return exits;
  });
}

/** 飲み屋街の分析に使う店（バー・パブ・居酒屋・ナイトクラブ・カラオケ・夜の店） */
export function nightPois(pois: Poi[]): Poi[] {
  return pois.filter(
    (p) =>
      p.category === "夜の店" ||
      p.kind === "karaoke_box" ||
      (p.category === "飲食" && /izakaya|yakitori|bar|pub|wine|beer|sake|oden|horumon|kushi/i.test(p.kind)),
  );
}
