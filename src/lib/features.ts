import { promises as fs } from "fs";
import path from "path";
import type Anthropic from "@anthropic-ai/sdk";
import { AREAS, distanceM, getArea, nearestAreas, type Area } from "./areas";
import { askJSON, askText, askWithWebSearch, isDemoMode, AIError } from "./claude";
import { demoChat, demoDiagnosis, demoInsight, demoLecture, demoTrend } from "./demo";
import { geocode, type GeoPoint } from "./geocode";
import { baseSystem, findInsights, formatInsights, getAreaNote } from "./knowledge";
import {
  diagnosisSchema,
  diagnosisValidator,
  insightSchema,
  insightValidator,
  lectureSchema,
  lectureValidator,
  type Diagnosis,
  type Lecture,
  type LectureAI,
} from "./schemas";
import { pointInPolygon, zonePolygon, type LatLng } from "./geo";
import { formatPois, poisAround, type Poi } from "./sources/osm";
import { ALL_GENRES, GENRE_SLUGS } from "./constants";
import { cityStats, formatCityStats, type CityStats } from "./sources/estat";
import { competition, composition, formatCompetition, formatComposition, type Competition } from "./sources/hotpepper";
import { formatYouTube, youtubeTrends, type YouTubeVideo } from "./sources/youtube";
import { cached, DATA_DIR, INDICATORS, readDB, updateDB, type PostInsight, type TrendCache, type TrendNote } from "./store";

const DAY = 24 * 60 * 60 * 1000;

/** 外部データは取れなくても分析を止めない */
async function safe<T>(label: string, p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch (err) {
    console.warn(`[${label}]`, err instanceof Error ? err.message : err);
    return null;
  }
}

// ─────────────────────────────────────────────
// 商圏を学ぼう：街の講義
// ─────────────────────────────────────────────

const LECTURE_TTL = 14 * DAY;

function hashText(t: string): string {
  let h = 0;
  for (const c of t) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h.toString(36);
}

/** 町の歴史・名残・新しい動き・支える人を、Web（ニュース中心）で調べる。30日キャッシュ */
async function researchTown(place: string, cacheKey: string) {
  return cached(`research:${cacheKey}`, 30 * DAY, () =>
    askWithWebSearch({
      system:
        "あなたは東京の街の商業史と商圏のリサーチャーです。最近のニュース記事、自治体の資料、再開発の発表などの公開情報から、事実を調べてまとめます。",
      prompt: [
        `東京の「${place}」について、商圏を分析するための材料を調べてください。`,
        "1. 町の歴史：成り立ち（宿場、闇市、花街・赤線、市場、工場など）と、その名残が今どこにどう残っているか",
        "2. 新しい勢力：ここ10年ほどの再開発、新しい大型店・施設の開業や移転、閉店、新しい客層（インバウンド、推し活、ファミリーなど）",
        "3. 最近のニュース：ここ1〜2年の商業・飲食・街づくりのニュース",
        "4. 町を支える人：この街に来る・住む人（どの路線・方面から来るか、オフィス、学生、観光客、単身世帯など）と、そのニーズ",
        "5. 同業が集まって競争している業種（家電、釣具、ラーメンなど）や、店の組み合わせで人が流れている例",
        "それぞれ年や固有名詞を添えて、日本語の箇条書きでまとめてください。確かめられないことは書かないでください。",
      ].join("\n"),
      maxUses: 8,
    }),
  );
}

export function buildMap(ai: LectureAI, pois: Poi[]): Lecture["map"] {
  const byId = new Map(pois.map((p) => [p.id, p]));
  const pointsOf = (ids: string[]) =>
    ids.map((id) => byId.get(id)).filter((p): p is Poi => !!p).map((p) => [p.lat, p.lng] as LatLng);
  return {
    zones: ai.zones.map((z) => {
      // 中心から大きく外れた店は、AIの取り違えとして色塗りから外す
      const pts = pointsOf(z.poiIds).filter(
        ([la, lo]) => distanceM(la, lo, z.anchor.lat, z.anchor.lng) <= Math.max(800, z.anchor.radiusM * 2.5),
      );
      return {
        polygon: pts.length >= 3 ? zonePolygon(pts) : null,
        circle: { lat: z.anchor.lat, lng: z.anchor.lng, radiusM: Math.min(600, Math.max(50, z.anchor.radiusM)) },
      };
    }),
    relations: ai.relations.map((r) => ({ points: pointsOf(r.poiIds) })),
  };
}

/** 作成済みの講義があれば返す（立地調査で使う。なければ作らない） */
async function cachedLecture(areaId: string): Promise<Lecture | null> {
  const c = (await readDB()).lectures[areaId];
  if (!c || !("conclusion" in (c.data as object))) return null;
  return c.data as Lecture;
}

/** 点がどの商圏に入るか。どれにも入らなければ最寄りの商圏（300m以内） */
export function locateZone(
  p: LatLng,
  zones: { name: string; polygon: LatLng[] | null; circle: { lat: number; lng: number; radiusM: number } }[],
): { name: string; inside: boolean; distance: number } | null {
  let best: { name: string; inside: boolean; distance: number } | null = null;
  for (const z of zones) {
    const d = Math.round(distanceM(p[0], p[1], z.circle.lat, z.circle.lng));
    const inside = z.polygon ? pointInPolygon(p, z.polygon) : d <= z.circle.radiusM;
    if (inside) return { name: z.name, inside: true, distance: 0 };
    if (d - z.circle.radiusM <= 300 && (!best || d < best.distance)) best = { name: z.name, inside: false, distance: d };
  }
  return best;
}

/** key は街のID、または自由入力の地名 */
export async function getLecture(key: string): Promise<{ area: Area | null; lecture: Lecture }> {
  const area = getArea(key) ?? AREAS.find((a) => key.includes(a.name.split("・")[0])) ?? null;
  const place = area?.name ?? key.trim().slice(0, 40);
  const cacheKey = area ? area.id : `custom:${place}`;

  if (isDemoMode()) return { area, lecture: demoLecture(area, place) };

  const [insights, note] = await Promise.all([
    area ? findInsights({ areaIds: [area.id], limit: 12 }) : Promise.resolve([]),
    area ? getAreaNote(area.id) : Promise.resolve(""),
  ]);
  const version = `${insights.length}:${hashText(note)}`;
  const db = await readDB();
  const cached_ = db.lectures[cacheKey] as { data: Lecture; postCount: number | string; createdAt: string } | undefined;
  // 投稿や調査メモが増えたら作り直す（＝投稿がたまるほど講義が育つ）
  if (
    cached_ &&
    Date.now() - Date.parse(cached_.createdAt) < LECTURE_TTL &&
    String(cached_.postCount) === version &&
    "conclusion" in (cached_.data as object)
  ) {
    return { area, lecture: cached_.data };
  }

  const point = area ? { lat: area.lat, lng: area.lng, label: area.name } : await geocode(place);
  const center = point ? { lat: point.lat, lng: point.lng } : null;
  const radius = area?.category === "terminal" || area?.category === "tama" ? 1000 : 800;

  const [pois, mix, stats, research] = await Promise.all([
    center ? safe("osm", poisAround(center.lat, center.lng, radius)) : Promise.resolve(null),
    center ? safe("hotpepper", composition(center.lat, center.lng)) : Promise.resolve(null),
    safe("estat", cityStats(area?.city, point?.label, place)),
    safe("research", researchTown(place, cacheKey)),
  ]);

  const system = await baseSystem(
    "あなたの役割は、指定された東京の街の商圏を、運営の「街の商圏の分析手順」とお手本（池袋）に沿って分析し、初心者にも分かる講義にすることです。",
  );
  const content = [
    `分析する街：${place}${center ? `（中心：緯度${center.lat.toFixed(5)} 経度${center.lng.toFixed(5)}、半径${radius}mを分析）` : ""}`,
    area ? `<運営が特に見てほしいポイント>\n${area.hints.map((h) => `- ${h}`).join("\n")}\n</運営が特に見てほしいポイント>` : "",
    note ? `<運営の現地調査メモ（最も信頼できる事実。必ず反映する）>\n${note}\n</運営の現地調査メモ>` : "",
    `<区市の統計（e-Stat）>\n${formatCityStats(stats)}\n</区市の統計>`,
    `<地図上の店・施設（OpenStreetMap）>\n${pois ? formatPois(pois, center!) : "（取得できませんでした）"}\n</地図上の店・施設>`,
    mix ? `<飲食店の構成（ホットペッパー）>\n${formatComposition(mix)}\n</飲食店の構成>` : "",
    `<Web・ニュースの調査>\n${research?.text ?? "（取得できませんでした）"}\n</Web・ニュースの調査>`,
    `<この街のみんなの投稿（AIが読み取った気づき）>\n${formatInsights(insights)}\n</みんなの投稿>`,
    "",
    "分析の進め方：",
    "- 運営の「街の商圏の分析手順」の1〜8の順に考え、お手本（池袋）と同じ具体性で書く。店や施設は実在の名前で書く。",
    "- zones の poiIds と relations の poiIds には、地図の店一覧にある id だけを使う（作らない）。一覧にない店は places の名前だけで書き、poiIds は空にする。",
    "- zones の anchor は、その商圏の店が集まっている場所の中心と広がり。地図の店の座標から決める。",
    "- 運営の現地調査メモにある事実は最優先で使い、矛盾するWeb情報より優先する。",
    "- 数字・年・店名は、上の材料にあるものだけを使う。確かでないことは「〜の傾向」「〜と言われる」と書く。",
    "- 東京都外の場所なら isTokyo を false にし、他の項目は空でかまわない。",
    "- 読み手はデートや友人との街歩きの前に読む人。専門用語には短い言い換えを添える。",
  ]
    .filter(Boolean)
    .join("\n\n");

  const ai = await askJSON({ system, content, schema: lectureSchema, validator: lectureValidator, effort: "high" });
  const lecture: Lecture = {
    ...ai,
    center,
    map: buildMap(ai, pois ?? []),
    sources: research?.sources ?? [],
    dataUsed: { osm: !!pois?.length, hotpepper: !!mix, estat: !!stats },
  };
  if (lecture.isTokyo) {
    await updateDB((d) => {
      d.lectures[cacheKey] = { data: lecture, postCount: version, createdAt: new Date().toISOString() };
    });
  }
  return { area, lecture };
}

export const FREE_QUESTIONS_PER_AREA = 1;

export async function answerQuestion(opts: {
  uid: string;
  areaKey: string;
  history: { role: "user" | "assistant"; content: string }[];
  question: string;
}): Promise<{ answer: string; remaining: number } | { paywall: true }> {
  const usageKey = `${opts.uid}:${opts.areaKey}`;
  const used = (await readDB()).chatUsage[usageKey] ?? 0;
  if (used >= FREE_QUESTIONS_PER_AREA) return { paywall: true };

  let answer: string;
  if (isDemoMode()) {
    answer = demoChat(opts.question);
  } else {
    const { area, lecture } = await getLecture(opts.areaKey);
    const insights = area ? await findInsights({ areaIds: [area.id], limit: 10 }) : [];
    const system = [
      await baseSystem("あなたの役割は、商圏の講義を読んだ人からの質問に答えることです。"),
      "",
      `<講義の内容>\n${JSON.stringify({ ...lecture, map: undefined })}\n</講義の内容>`,
      `<みんなの投稿>\n${formatInsights(insights)}\n</みんなの投稿>`,
      "",
      "回答は300字程度で、会話で使える一言で締めくくってください。商圏と関係のない質問には、やんわり街の話に戻してください。",
    ].join("\n");
    const messages: Anthropic.Beta.BetaMessageParam[] = [
      ...opts.history.slice(-6).map((m) => ({ role: m.role, content: m.content })),
      { role: "user", content: opts.question.slice(0, 500) },
    ];
    answer = await askText({ system, messages, effort: "low" });
  }

  const remaining = await updateDB((d) => {
    d.chatUsage[usageKey] = (d.chatUsage[usageKey] ?? 0) + 1;
    return Math.max(0, FREE_QUESTIONS_PER_AREA - d.chatUsage[usageKey]);
  });
  return { answer, remaining };
}

export async function remainingQuestions(uid: string, areaKey: string): Promise<number> {
  const used = (await readDB()).chatUsage[`${uid}:${areaKey}`] ?? 0;
  return Math.max(0, FREE_QUESTIONS_PER_AREA - used);
}

// ─────────────────────────────────────────────
// トレンド巡回
// ─────────────────────────────────────────────

function genreSlug(genre: string): string {
  return GENRE_SLUGS[genre as keyof typeof GENRE_SLUGS] ?? "other";
}

/** Claude Code の /crawl-trends が書き出したファイル */
async function readCrawledTrend(genre: string): Promise<TrendCache | null> {
  try {
    const raw = await fs.readFile(path.join(DATA_DIR, "trends", `${genreSlug(genre)}.json`), "utf8");
    return { ...(JSON.parse(raw) as TrendCache), by: "claude-code" };
  } catch {
    return null;
  }
}

export async function getTrend(genre: string): Promise<TrendCache> {
  if (isDemoMode()) return { genre, ...demoTrend(genre), fetchedAt: new Date().toISOString(), by: "demo" };

  const candidates = [await readCrawledTrend(genre), (await readDB()).trends[genre]].filter(
    (t): t is TrendCache => !!t && Date.now() - Date.parse(t.fetchedAt) < 3 * DAY,
  );
  candidates.sort((a, b) => Date.parse(b.fetchedAt) - Date.parse(a.fetchedAt));
  if (candidates[0]) return candidates[0];

  const { text, sources } = await askWithWebSearch({
    system: "あなたは飲食トレンドのリサーチャーです。X（旧Twitter）やInstagramで話題になっている飲食トレンドを、Web上の公開情報から調べてまとめます。",
    prompt: [
      `ジャンル「${genre}」について、ここ1〜3か月に東京でSNS（X・Instagram・TikTok）を中心に話題になっている商品・メニュー・見せ方のトレンドを調べてください。`,
      "・具体的な商品名や特徴（形、サイズ、色、食べ方、価格帯）",
      "・なぜ拡散されたのか（写真映え、限定性、食べ歩き、推し活など）",
      "・どんな客層に刺さっているか",
      "最後に、日本語で箇条書き5〜8項目にまとめてください。調べた日付に近い情報を優先し、古い情報はそうと分かるように書いてください。",
    ].join("\n"),
  });
  const trend: TrendCache = { genre, report: text.trim(), sources, fetchedAt: new Date().toISOString(), by: "api" };
  await updateDB((d) => {
    d.trends[genre] = trend;
  });
  return trend;
}

/** 運営が手で入れた流行メモ（直近14日、その業態と「全般」） */
export async function recentNotes(genre: string, days = 14): Promise<TrendNote[]> {
  const since = Date.now() - days * DAY;
  return (await readDB()).trendNotes
    .filter((n) => (n.genre === genre || n.genre === ALL_GENRES) && Date.parse(n.createdAt) >= since)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 20);
}

export function formatNotes(notes: TrendNote[]): string {
  if (notes.length === 0) return "（直近の流行メモはありません）";
  return notes
    .map((n) => `- [${n.createdAt.slice(0, 10)}｜${n.source}｜${n.genre}] ${n.text}${n.url ? `（${n.url}）` : ""}`)
    .join("\n");
}

export interface TrendBundle {
  web: TrendCache;
  youtube: YouTubeVideo[];
  notes: TrendNote[];
}

/** 流行の材料をまとめて集める：手入れのSNSメモ ＋ YouTube ＋ Web巡回 */
export async function getTrendBundle(genre: string): Promise<TrendBundle> {
  const [web, youtube, notes] = await Promise.all([
    getTrend(genre),
    safe("youtube", youtubeTrends(genre)),
    recentNotes(genre),
  ]);
  return { web, youtube: youtube ?? [], notes };
}

// ─────────────────────────────────────────────
// 立地調査
// ─────────────────────────────────────────────

export interface DiagnosisResult {
  diagnosis: Diagnosis;
  point: GeoPoint | null;
  nearby: { id: string; name: string; distance: number }[];
  trend: TrendBundle;
  competition: Competition | null;
  city: CityStats | null;
  /** 近くの街の講義（作成済みのとき）の商圏の色分けと、この店から関係先への線 */
  areaMap: { areaName: string; zones: { name: string; polygon: LatLng[] | null; circle: { lat: number; lng: number; radiusM: number } }[] } | null;
  relationLines: LatLng[][];
  demo: boolean;
}

export async function diagnose(input: { name: string; address: string; genre: string }): Promise<DiagnosisResult> {
  const point = await geocode(input.address);
  const nearby = point ? nearestAreas(point.lat, point.lng, 3) : [];
  const nearbyInfo = nearby.map(({ area, distance }) => ({ id: area.id, name: area.name, distance: Math.round(distance) }));

  // 外部データはAPIキーがあればデモ表示でも取得する（つながっているかを画面で確かめられるように）
  const homeArea = nearby[0] && nearby[0].distance < 2000 ? nearby[0].area : null;
  const [trend, comp, city, pois, lectureCache] = await Promise.all([
    getTrendBundle(input.genre),
    point ? safe("hotpepper", competition(point.lat, point.lng, input.genre)) : Promise.resolve(null),
    safe("estat", cityStats(point?.label, input.address)),
    point ? safe("osm", poisAround(point.lat, point.lng, 400)) : Promise.resolve(null),
    homeArea ? cachedLecture(homeArea.id) : Promise.resolve(null),
  ]);
  // 近くの街の講義がまだなければ、次回のために裏で作っておく（待たない）
  if (homeArea && !lectureCache && !isDemoMode()) void getLecture(homeArea.id).catch(() => undefined);

  const areaMap =
    homeArea && lectureCache
      ? {
          areaName: homeArea.name,
          zones: lectureCache.zones.map((z, i) => ({ name: z.name, ...lectureCache.map.zones[i] })),
        }
      : null;
  const zoneHere = point && areaMap ? locateZone([point.lat, point.lng], areaMap.zones) : null;

  if (isDemoMode()) {
    return {
      diagnosis: demoDiagnosis(input.name, input.address, input.genre),
      point,
      nearby: nearbyInfo,
      trend,
      competition: comp,
      city,
      areaMap,
      relationLines: [],
      demo: true,
    };
  }

  const areaIds = nearby.filter((n) => n.distance < 2500).map((n) => n.area.id);
  const [local, connectionCases] = await Promise.all([
    findInsights({ areaIds: areaIds.length ? areaIds : undefined, limit: 12 }),
    findInsights({ indicator: "接続性", limit: 6 }),
  ]);

  const system = await baseSystem(
    "あなたの役割は、飲食店の立地を5つの評価軸で1〜5の5段階評価し、どんなメニューがバズるかを提案することです。",
  );
  const content = [
    `店名：${input.name}`,
    `住所：${input.address}`,
    `業態：${input.genre}`,
    point
      ? `位置：緯度${point.lat.toFixed(5)} 経度${point.lng.toFixed(5)}（${point.label}${point.approximate ? "、概算" : ""}）`
      : "位置：住所から座標を特定できませんでした。住所の文字情報から推定してください。",
    nearby.length
      ? `近くの主要商圏：\n${nearby
          .map(({ area, distance }) => `- ${area.name}（約${Math.round(distance)}m）：${area.hints.join(" / ")}`)
          .join("\n")}`
      : "",
    `<周辺のみんなの投稿>\n${formatInsights(local)}\n</周辺のみんなの投稿>`,
    `<接続性について集まった気づき（他の街も含む）>\n${formatInsights(connectionCases)}\n</接続性について集まった気づき>`,
    lectureCache
      ? `<${homeArea!.name}の商圏の割れ方（講義の分析）>\n${lectureCache.zones
          .map((z) => `- ${z.name}（${z.area}、${z.peak}）：${z.character}`)
          .join("\n")}\n店の位置から判定した所属：${zoneHere ? `${zoneHere.name}（${zoneHere.inside ? "範囲内" : `最寄り、約${zoneHere.distance}m`}）` : "判定できず"}\n</商圏の割れ方>`
      : "",
    lectureCache
      ? `<${homeArea!.name}で分かっている店と店の関係>\n${lectureCache.relations
          .map((r) => `- [${r.type}] ${r.places.join(" → ")}：${r.flow}`)
          .join("\n")}\n</店と店の関係>`
      : "",
    homeArea ? `<運営の現地調査メモ（${homeArea.name}）>\n${(await getAreaNote(homeArea.id)) || "（なし）"}\n</運営の現地調査メモ>` : "",
    `<店から半径400m以内の店・施設（OpenStreetMap）>\n${pois && point ? formatPois(pois, point, 200) : "（取得できませんでした）"}\n</店から半径400m以内の店・施設>`,
    `<周辺の飲食店（ホットペッパー）>\n${formatCompetition(comp, input.genre)}\n</周辺の飲食店>`,
    `<区市の人口・世帯（e-Stat）>\n${formatCityStats(city)}\n</区市の人口・世帯>`,
    `<${input.genre}の流行：運営がX・Instagramなどから手で集めたメモ（最優先で参考にする）>\n${formatNotes(trend.notes)}\n</流行メモ>`,
    `<${input.genre}の流行：YouTubeで直近30日に再生が多い動画>\n${formatYouTube(trend.youtube)}\n</YouTube>`,
    `<${input.genre}の流行：Web記事の巡回>\n${trend.web.report}\n</Web記事の巡回>`,
    "",
    `評価軸は必ず ${INDICATORS.join("・")} の5つをこの順で出してください。`,
    "3を「平均的」とし、根拠が乏しい場合は3に寄せ、その旨を caveats に書いてください。",
    "数字のデータ（同業の軒数、一人暮らしの割合、昼夜間人口比など）がある軸は、その数字を reason に必ず引用してください。データがない軸は推定であることを書いてください。",
    "trendFit とバズるメニューは、流行メモ・YouTube・Web記事のどれに基づくかが分かるように書いてください。",
    "この店について知らない場合は、店名と業態から一般的な店として評価し、知っているふりをしないでください。",
    "運営の「立地調査での使いかた」に沿って、まず zoneFit（どの商圏の中・端・外か）を決め、次に relations（周りの実在の店との補完・集積・価格競争）を書き、その読みを5つの軸の点数の根拠にしてください。",
    "relations の poiIds には、店から半径400m以内の一覧にある id だけを使ってください（作らない）。",
  ]
    .filter(Boolean)
    .join("\n\n");

  const diagnosis = await askJSON({
    system,
    content,
    schema: diagnosisSchema,
    validator: diagnosisValidator,
    effort: "high",
  });
  // 並び順と重複をそろえる
  diagnosis.scores = INDICATORS.map(
    (ind) => diagnosis.scores.find((s) => s.indicator === ind) ?? { indicator: ind, score: 3, reason: "評価できませんでした", advice: "" },
  );
  const byId = new Map((pois ?? []).map((p) => [p.id, p]));
  const relationLines = diagnosis.relations.map((r) =>
    [[point?.lat ?? 0, point?.lng ?? 0] as LatLng].concat(
      r.poiIds.map((id) => byId.get(id)).filter((p): p is Poi => !!p).map((p) => [p.lat, p.lng] as LatLng),
    ),
  );
  return {
    diagnosis,
    point,
    nearby: nearbyInfo,
    trend,
    competition: comp,
    city,
    areaMap,
    relationLines: point ? relationLines : [],
    demo: false,
  };
}

// ─────────────────────────────────────────────
// みんなの投稿：写真とコメントを読み取って育成データにする
// ─────────────────────────────────────────────

export async function readPost(opts: {
  image: { data: string; mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif" } | null;
  comment: string;
  areaId: string;
}): Promise<PostInsight | null> {
  if (isDemoMode()) return demoInsight(opts.comment);

  const area = getArea(opts.areaId);
  const system = await baseSystem(
    "あなたの役割は、街歩きをした人が投稿した写真とコメントから、商圏についての気づきを読み取り、分類することです。",
  );
  const content: Anthropic.Beta.BetaContentBlockParam[] = [];
  if (opts.image) {
    content.push({ type: "image", source: { type: "base64", media_type: opts.image.mediaType, data: opts.image.data } });
  }
  content.push({
    type: "text",
    text: [
      `街：${area?.name ?? opts.areaId}`,
      `投稿者のコメント：${opts.comment}`,
      "",
      "この気づきが5つの評価軸のどれに最も関係するかを選び、その立地構成がなぜ客を呼ぶのか（どちらの店・誰にメリットがあるのか）を説明してください。",
      "誰かが「気づいた」組み合わせは、両方にメリットのある立地構成の証拠として扱ってください。",
      "写真に写る人の顔や個人を特定する情報には触れないでください。商圏と無関係な投稿は relevant を false にしてください。",
    ].join("\n"),
  });

  try {
    const r = await askJSON({ system, content, schema: insightSchema, validator: insightValidator, effort: "low" });
    if (!r.relevant) return null;
    return { indicator: r.indicator, summary: r.summary, mechanism: r.mechanism, tags: r.tags.slice(0, 6), quality: r.quality };
  } catch (err) {
    // 読み取りに失敗しても投稿自体は残す
    if (err instanceof AIError) return null;
    throw err;
  }
}
