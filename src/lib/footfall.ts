import { readAnalysis } from "./analyses";
import { distanceM, nearestAreas } from "./areas";
import type { GeoPoint } from "./geocode";
import { matchExit, offset } from "./nightlife";
import { stationExits, stationsAround, type Station, type StationExit } from "./sources/osm";

// 立地調査の「集客基盤」の集計。
// 飲み屋街の分析と同じく、まず駅の出口をすべて読み取り、店の住所（緯度・経度）から
// 一番近い出口までの距離と、その出口から先の人の流れで、そもそも人が通る場所かを測る。

/** 歩く速さ（m/分）と、直線距離から道のりへの係数 */
const WALK_M_PER_MIN = 80;
const ROUTE_FACTOR = 1.25;
/** 出口を探す範囲（店から） */
const EXIT_RADIUS = 800;
/** 駅を探す範囲（店から） */
const STATION_RADIUS = 1000;

export interface FootfallExit {
  /** 出口の名前（例：東口、A1） */
  name: string;
  /** 店からの直線距離（m） */
  distanceM: number;
  /** 歩いて何分か（直線距離×1.25 を分速80mで割ったもの） */
  walkMin: number;
  /** その出口から先の人の流れ（飲み屋街の分析にあるとき） */
  flow?: string;
  who?: string;
  /** 位置がおおよそ（OpenStreetMap で見つからず、方角から置いたもの） */
  approx: boolean;
}

export interface FootfallBase {
  /** 店の住所の位置が概算か */
  approximate: boolean;
  exits: FootfallExit[];
  nearest: FootfallExit | null;
  stations: { name: string; operators: string[]; distanceM: number }[];
  /** 店から 300m・500m・800m 以内の出口の数 */
  counts: { m300: number; m500: number; m800: number };
  /** 集客基盤の目安（1〜5） */
  score: number;
  /** 点数の内訳（画面と理由に出す） */
  breakdown: string[];
  /** 何から集計したか */
  source: "osm" | "analysis" | "none";
}

const walkMin = (m: number) => Math.max(1, Math.ceil((m * ROUTE_FACTOR) / WALK_M_PER_MIN));

/** 一番近い出口まで歩いて何分かで、土台の点数を決める */
function baseScore(min: number): number {
  if (min <= 2) return 5;
  if (min <= 4) return 4;
  if (min <= 6) return 3;
  if (min <= 9) return 2;
  return 1;
}

async function safe<T>(p: Promise<T>, ms: number): Promise<T | null> {
  try {
    return await Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]);
  } catch {
    return null;
  }
}

/** 近くの街の飲み屋街の分析にある出口（名前・人の流れ・位置） */
async function analysisExits(point: GeoPoint, osmNearAreas: Map<string, StationExit[]>) {
  const out: { name: string; flow: string; who: string; lat: number; lng: number; approx: boolean }[] = [];
  for (const { area, distance } of nearestAreas(point.lat, point.lng, 3)) {
    if (distance > 2500) continue;
    const n = (await readAnalysis(area.id))?.nightlife;
    if (!n) continue;
    const osm = osmNearAreas.get(area.id) ?? [];
    for (const x of n.exits) {
      const hit = osm.find((e) => e.id === x.poiId) ?? matchExit(x.name, osm);
      if (hit) out.push({ name: x.name, flow: x.flow, who: x.who, lat: hit.lat, lng: hit.lng, approx: false });
      else {
        const [lat, lng] = offset({ lat: area.lat, lng: area.lng }, x.dir);
        out.push({ name: x.name, flow: x.flow, who: x.who, lat, lng, approx: true });
      }
    }
  }
  return out;
}

export async function footfallBase(point: GeoPoint): Promise<FootfallBase> {
  const areas = nearestAreas(point.lat, point.lng, 3).filter((n) => n.distance <= 2500);
  // 店のまわりの出口と駅、近くの街の駅の中心まわりの出口（分析の出口と名前でつき合わせる）を、待ちすぎないように取る
  const [osmExits, stations, ...areaExits] = await Promise.all([
    safe(stationExits(point.lat, point.lng, EXIT_RADIUS), 8000),
    safe(stationsAround(point.lat, point.lng, STATION_RADIUS), 8000),
    ...areas.map(({ area }) => safe(stationExits(area.lat, area.lng), 6000)),
  ]);
  const osmNearAreas = new Map(areas.map(({ area }, i) => [area.id, areaExits[i] ?? []]));
  const known = await analysisExits(point, osmNearAreas);

  let source: FootfallBase["source"] = "none";
  let exits: FootfallExit[] = [];
  if (osmExits && osmExits.length) {
    source = "osm";
    const knownAsExits = known.map((x, i) => ({ id: String(i), name: x.name, lat: x.lat, lng: x.lng }));
    exits = osmExits.map((e) => {
      const d = distanceM(point.lat, point.lng, e.lat, e.lng);
      // 分析の出口と、位置（60m以内）か名前で同じものなら、人の流れをつける
      const byName = matchExit(e.name, knownAsExits);
      const k = known.find((x) => !x.approx && distanceM(x.lat, x.lng, e.lat, e.lng) < 60) ?? (byName ? known[Number(byName.id)] : undefined);
      return { name: e.name, distanceM: Math.round(d), walkMin: walkMin(d), flow: k?.flow, who: k?.who, approx: false };
    });
  } else if (known.length) {
    // OpenStreetMap が使えないときは、飲み屋街の分析の出口（位置はおおよそ）で測る
    source = "analysis";
    exits = known.map((x) => {
      const d = distanceM(point.lat, point.lng, x.lat, x.lng);
      return { name: x.name, distanceM: Math.round(d), walkMin: walkMin(d), flow: x.flow, who: x.who, approx: x.approx };
    });
  }
  // 近い順に。同じ名前の出口は近いほうだけ（名前のない「出入口」はすべて残す）
  const seen = new Set<string>();
  exits = exits
    .sort((a, b) => a.distanceM - b.distanceM)
    .filter((e) => {
      if (e.name === "出入口") return true;
      if (seen.has(e.name)) return false;
      seen.add(e.name);
      return true;
    })
    .filter((e) => e.distanceM <= EXIT_RADIUS * 1.5);
  const counts = {
    m300: exits.filter((e) => e.distanceM <= 300).length,
    m500: exits.filter((e) => e.distanceM <= 500).length,
    m800: exits.filter((e) => e.distanceM <= 800).length,
  };
  exits = exits.slice(0, 10);
  const nearest = exits[0] ?? null;
  const st = groupStations(stations ?? [], point);

  const breakdown: string[] = [];
  let score: number;
  if (!nearest) {
    score = st.some((s) => s.distanceM <= 800) ? 2 : 1;
    breakdown.push(st.length ? "駅の出口の位置が分からないため、近くの駅までの距離で目安を出しました" : "店から1km以内に駅が見つかりませんでした");
  } else {
    score = baseScore(nearest.walkMin);
    breakdown.push(
      `一番近い出口「${nearest.name}」まで約${nearest.distanceM}m（歩いて約${nearest.walkMin}分）→ ${score}点（2分以内5・4分4・6分3・9分2・それ以上1）`,
    );
    const many = st.filter((s) => s.distanceM <= 800).length >= 3 || counts.m500 >= 10;
    if (many && score < 5) {
      score += 1;
      breakdown.push(`800m以内に駅が${st.filter((s) => s.distanceM <= 800).length}つ・500m以内に出口が${counts.m500}か所ある大きな乗り換えの場所なので +1`);
    }
    if (!st.some((s) => s.distanceM <= STATION_RADIUS) && source === "osm" && score > 2) {
      score = 2;
      breakdown.push("1km以内に駅の建物が見つからないため、2点までにしました");
    }
    if (nearest.flow) breakdown.push(`「${nearest.name}」から先の人の流れ：${nearest.flow}${nearest.who ? `（${nearest.who}）` : ""}`);
  }
  if (point.approximate) breakdown.push("住所から正確な位置が分からず、街の中心で概算したため、目安の精度は低めです");
  if (source === "analysis") breakdown.push("出口の位置は、飲み屋街の分析の方角から置いたおおよその位置です");

  return { approximate: point.approximate, exits, nearest, stations: st.slice(0, 6), counts, score, breakdown, source };
}

/** 同じ名前の駅（鉄道会社ちがい）をまとめる */
function groupStations(stations: Station[], point: GeoPoint) {
  const map = new Map<string, { name: string; operators: string[]; distanceM: number }>();
  for (const s of stations) {
    const name = s.name.replace(/駅$/, "");
    const d = Math.round(distanceM(point.lat, point.lng, s.lat, s.lng));
    const cur = map.get(name) ?? { name, operators: [], distanceM: d };
    if (s.operator && !cur.operators.includes(s.operator)) cur.operators.push(s.operator);
    cur.distanceM = Math.min(cur.distanceM, d);
    map.set(name, cur);
  }
  return [...map.values()].sort((a, b) => a.distanceM - b.distanceM);
}

/** AIに渡す形 */
export function formatFootfall(f: FootfallBase): string {
  const lines = [
    `集客基盤の目安：${f.score}点`,
    ...f.breakdown.map((b) => `- ${b}`),
    f.stations.length ? `店から1km以内の駅：${f.stations.map((s) => `${s.name}（約${s.distanceM}m${s.operators.length ? `・${s.operators.join("／")}` : ""}）`).join("、")}` : "店から1km以内の駅：見つからず",
    `店から300m以内の出口 ${f.counts.m300}か所・500m以内 ${f.counts.m500}か所・800m以内 ${f.counts.m800}か所`,
    ...f.exits.slice(0, 8).map((e) => `- 出口「${e.name}」約${e.distanceM}m（徒歩約${e.walkMin}分）${e.approx ? "［位置はおおよそ］" : ""}${e.flow ? `：${e.flow}` : ""}`),
  ];
  return lines.join("\n");
}
