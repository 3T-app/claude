import { readAnalysis } from "./analyses";
import { AREAS, distanceM, getArea, type Area } from "./areas";
import { askJSON, askWithWebSearch, isDemoMode } from "./claude";
import { zonePolygon, type LatLng } from "./geo";
import { baseSystem, findInsights, formatInsights, getAreaNote } from "./knowledge";
import { nightlifeSchema, nightlifeValidator, DIRECTIONS, type Nightlife, type NightlifeView } from "./schemas";
import { nightPois, poisAround, stationExits, type Poi, type StationExit } from "./sources/osm";
import { cached, readDB, updateDB } from "./store";

// 商圏を学ぼう → もっと詳しく → 飲み屋街。
// 手順は「駅の出口をすべて見つける → 出口から先の人の流れ → 飲み屋街の商圏と雰囲気」。
// Claude Code の事前分析（data/analyses/<id>.json の nightlife）をすぐ出し、
// APIキーがあれば OpenStreetMap の出口と店の位置で AI が分析し直して、次に開いたときから出す。

const DAY = 24 * 60 * 60 * 1000;
const MAX_AGE = 7 * DAY;

function hash(t: string): string {
  let h = 0;
  for (const c of t) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h.toString(36);
}

async function safe<T>(label: string, p: Promise<T>, ms = 0): Promise<T | null> {
  try {
    if (!ms) return await p;
    return await Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]);
  } catch (err) {
    console.warn(`[${label}]`, err instanceof Error ? err.message : err);
    return null;
  }
}

/** 方角から、駅の中心から約150m先のおおよその位置 */
function offset(center: { lat: number; lng: number }, dir: (typeof DIRECTIONS)[number]): LatLng {
  const deg = (DIRECTIONS.indexOf(dir) * 45 * Math.PI) / 180;
  const m = 150;
  return [
    center.lat + (m * Math.cos(deg)) / 111_320,
    center.lng + (m * Math.sin(deg)) / (111_320 * Math.cos((center.lat * Math.PI) / 180)),
  ];
}

/** 出口の名前を OpenStreetMap の出口とつき合わせる（「東口」と「JR東口」など） */
function matchExit(name: string, osm: StationExit[]): StationExit | undefined {
  const norm = (s: string) => s.replace(/\s|（.*?）|\(.*?\)|出口|改札/g, "");
  const n = norm(name);
  if (!n) return undefined;
  return osm.find((e) => norm(e.name) === n) ?? osm.find((e) => norm(e.name).includes(n) || n.includes(norm(e.name)));
}

function buildView(
  n: Nightlife,
  center: { lat: number; lng: number },
  osmExits: StationExit[],
  bars: Poi[],
  source: NightlifeView["source"],
): NightlifeView {
  const byExit = new Map(osmExits.map((e) => [e.id, e]));
  const byBar = new Map(bars.map((p) => [p.id, p]));
  return {
    ...n,
    map: {
      exits: n.exits.map((x) => {
        const hit = byExit.get(x.poiId) ?? matchExit(x.name, osmExits);
        if (hit) return { name: x.name, lat: hit.lat, lng: hit.lng, approx: false };
        const [lat, lng] = offset(center, x.dir);
        return { name: x.name, lat, lng, approx: true };
      }),
      districts: n.districts.map((d) => {
        const pts = d.poiIds
          .map((id) => byBar.get(id))
          .filter((p): p is Poi => !!p)
          .filter((p) => distanceM(p.lat, p.lng, d.anchor.lat, d.anchor.lng) <= Math.max(500, d.anchor.radiusM * 2.5))
          .map((p) => [p.lat, p.lng] as LatLng);
        return {
          polygon: pts.length >= 3 ? zonePolygon(pts) : null,
          circle: { lat: d.anchor.lat, lng: d.anchor.lng, radiusM: Math.min(500, Math.max(40, d.anchor.radiusM)) },
        };
      }),
    },
    source,
    dataUsed: { osmExits: osmExits.length, osmBars: bars.length },
  };
}

function formatExits(exits: StationExit[], center: { lat: number; lng: number }): string {
  if (exits.length === 0) return "（出口のデータなし）";
  return exits
    .map((e) => `${e.id}｜${e.name}｜駅の中心から${Math.round(distanceM(center.lat, center.lng, e.lat, e.lng))}m｜${e.lat.toFixed(5)},${e.lng.toFixed(5)}`)
    .join("\n");
}

function formatBars(bars: Poi[], limit = 220): string {
  if (bars.length === 0) return "（飲み屋のデータなし）";
  return bars
    .slice(0, limit)
    .map((p) => `${p.id}｜${p.name}｜${p.kind}｜${p.lat.toFixed(5)},${p.lng.toFixed(5)}`)
    .join("\n");
}

function formatNightlife(n: Nightlife): string {
  return [
    `全体：${n.summary}`,
    `出口：${n.exits.map((x) => `${x.name}（${x.flow}）`).join("／")}`,
    `飲み屋街：${n.districts.map((d) => `${d.name}［${d.vibe}・${d.target}］${d.atmosphere}`).join("／")}`,
  ].join("\n");
}

/** 飲み屋街の夜の様子を Web で調べる。30日キャッシュ */
function researchNight(place: string, key: string) {
  return cached(`night-research:${key}`, 30 * DAY, () =>
    askWithWebSearch({
      system: "あなたは東京の夜の街に詳しいリサーチャーです。調べたことだけを日本語で簡潔にまとめます。",
      prompt: [
        `東京の「${place}」駅周辺の飲み屋街について調べてください。`,
        "1. 駅の出口ごとに、どの方向へどんな人が流れるか（通り・商店街・オフィス街・住宅地など）",
        "2. 飲み屋街・横丁・夜の繁華街の名前、場所、雰囲気（昼飲み、せんべろ、隠れ家バー、高級クラブ、ホスト街、ガールズバー、ライブハウス周りなど）と主な客層",
        "3. 最近の変化（新しい横丁や店の開業、閉店、客引き・高額請求の規制や注意喚起など）",
        "年や固有名詞を添えて箇条書きで。確かめられないことは書かないでください。",
      ].join("\n"),
      maxUses: 6,
    }),
  );
}

interface CachedNight {
  data: NightlifeView;
  createdAt: string;
  version: string;
}

const generating = new Set<string>();
const lastTried = new Map<string, number>();

export async function getNightlife(key: string): Promise<{ area: Area | null; nightlife: NightlifeView | null }> {
  const area = getArea(key) ?? AREAS.find((a) => key.includes(a.name.split("・")[0])) ?? null;
  if (!area) return { area: null, nightlife: null };
  const center = { lat: area.lat, lng: area.lng };
  const stored = (await readAnalysis(area.id))?.nightlife ?? null;
  const note = await getAreaNote(area.id);
  const version = hash(JSON.stringify([stored, note]));

  if (!isDemoMode()) {
    const prev = (await readDB()).nightlife[area.id] as CachedNight | undefined;
    if (prev && prev.version === version && Date.now() - Date.parse(prev.createdAt) < MAX_AGE) {
      return { area, nightlife: prev.data };
    }
    const shown = prev?.data ?? null;
    if (shown || stored) {
      if (!generating.has(area.id) && Date.now() - (lastTried.get(area.id) ?? 0) > 60 * 60 * 1000) {
        generating.add(area.id);
        lastTried.set(area.id, Date.now());
        void generate(area, stored, note, version)
          .catch((err) => console.warn("[nightlife]", err instanceof Error ? err.message : err))
          .finally(() => generating.delete(area.id));
      }
      if (shown) return { area, nightlife: shown };
    } else {
      return { area, nightlife: await generate(area, stored, note, version) };
    }
  }

  if (!stored) return { area, nightlife: null };
  // 事前分析を出すときも、出口の位置は OpenStreetMap で確かめられれば実際の位置にする（待つのは最大6秒）
  const osmExits = (await safe("osm-exits", stationExits(center.lat, center.lng), 6000)) ?? [];
  return { area, nightlife: buildView(stored, center, osmExits, [], isDemoMode() ? "demo" : "claude-code") };
}

async function generate(area: Area, stored: Nightlife | null, note: string, version: string): Promise<NightlifeView> {
  const center = { lat: area.lat, lng: area.lng };
  const radius = area.category === "terminal" || area.category === "tama" ? 1000 : 800;
  const [exits, pois, research, insights, analysis] = await Promise.all([
    safe("osm-exits", stationExits(center.lat, center.lng)),
    safe("osm", poisAround(center.lat, center.lng, radius)),
    safe("night-research", researchNight(area.name, area.id)),
    findInsights({ areaIds: [area.id], limit: 8 }),
    readAnalysis(area.id),
  ]);
  const bars = nightPois(pois ?? []);

  const system = await baseSystem(
    "あなたの役割は、東京の街の飲み屋街を、商圏の見かたで大人に案内することです。読み手は、どこにどんな雰囲気の飲み屋街があるかを探している大人です。",
  );
  const content = [
    `分析する街：${area.name}（駅の中心：緯度${center.lat.toFixed(5)} 経度${center.lng.toFixed(5)}）`,
    note ? `<運営の現地調査メモ（最も信頼できる事実）>\n${note}\n</運営の現地調査メモ>` : "",
    analysis ? `<この街の商圏の割れ方>\n${analysis.zones.map((z) => `${z.name}［${z.peak}］${z.character}`).join("\n")}\n</この街の商圏の割れ方>` : "",
    `<駅の出口（OpenStreetMap）>\n${formatExits(exits ?? [], center)}\n</駅の出口>`,
    `<飲み屋・バー・夜の店（OpenStreetMap）>\n${formatBars(bars)}\n</飲み屋・バー・夜の店>`,
    stored ? `<事前の分析（Claude Code が公開情報で作成。地図の店データで確かめ、深める）>\n${formatNightlife(stored)}\n</事前の分析>` : "",
    `<Web の調査>\n${research?.text ?? "（取得できませんでした）"}\n</Web の調査>`,
    `<みんなの投稿>\n${formatInsights(insights)}\n</みんなの投稿>`,
    "",
    "分析の進め方（この順で考える）：",
    "1. まず駅の出口をすべて挙げる。出口一覧にあるものは poiId にその id を入れる。駅が複数ある街は、主な駅の出口を挙げる。",
    "2. 次に、それぞれの出口から先にどんな人の流れが起きているか（どの通りを、誰が、どの時間に、どこへ）を考える。",
    "3. その2つを前提に、飲み屋街の商圏を分ける。出口からの流れが、どの飲み屋街の客になっているかを fromExits で示す。",
    "- vibe は、その飲み屋街の性格に一番近いものを選ぶ（若者の昼飲み、大人の隠れ家、高額なホスト街など）。",
    "- poiIds には飲み屋一覧にある id だけを使う。anchor は店が集まる場所の中心と広がり。",
    "- 高額請求・客引き・未成年の飲酒などのリスクがある街は caution に具体的に書く。特定の店を名指しで悪く書かない。",
    "- 店名・年・数字は材料にあるものだけを使う。予算は budget の4段階で示し、金額は書かない。",
  ]
    .filter(Boolean)
    .join("\n\n");

  const ai = await askJSON({ system, content, schema: nightlifeSchema, validator: nightlifeValidator, effort: "medium" });
  const view: NightlifeView = { ...buildView(ai, center, exits ?? [], bars, "ai"), generatedAt: new Date().toISOString() };
  await updateDB((d) => {
    d.nightlife[area.id] = { data: view, createdAt: new Date().toISOString(), version };
  });
  return view;
}

/** 講義への質問で使う：作成済みの飲み屋街の分析（なければ事前分析） */
export async function nightlifeContext(areaId: string): Promise<string> {
  const cachedView = (await readDB()).nightlife[areaId] as CachedNight | undefined;
  const n = cachedView?.data ?? (await readAnalysis(areaId))?.nightlife;
  return n ? formatNightlife(n) : "";
}
