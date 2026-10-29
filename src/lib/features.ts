import { promises as fs } from "fs";
import path from "path";
import type Anthropic from "@anthropic-ai/sdk";
import { AREAS, getArea, nearestAreas, type Area } from "./areas";
import { askJSON, askText, askWithWebSearch, isDemoMode, AIError } from "./claude";
import { demoChat, demoDiagnosis, demoInsight, demoLecture, demoTrend } from "./demo";
import { geocode, type GeoPoint } from "./geocode";
import { baseSystem, findInsights, formatInsights } from "./knowledge";
import {
  diagnosisSchema,
  diagnosisValidator,
  insightSchema,
  insightValidator,
  lectureSchema,
  lectureValidator,
  type Diagnosis,
  type Lecture,
} from "./schemas";
import { GENRE_SLUGS } from "./constants";
import { DATA_DIR, INDICATORS, readDB, updateDB, type PostInsight, type TrendCache } from "./store";

const DAY = 24 * 60 * 60 * 1000;

// ─────────────────────────────────────────────
// 商圏を学ぼう：街の講義
// ─────────────────────────────────────────────

/** key は街のID、または自由入力の地名 */
export async function getLecture(key: string): Promise<{ area: Area | null; lecture: Lecture }> {
  const area = getArea(key) ?? AREAS.find((a) => key.includes(a.name.split("・")[0])) ?? null;
  const place = area?.name ?? key.trim().slice(0, 40);
  const cacheKey = area ? area.id : `custom:${place}`;

  if (isDemoMode()) return { area, lecture: demoLecture(area, place) };

  const insights = area ? await findInsights({ areaIds: [area.id], limit: 10 }) : [];
  const db = await readDB();
  const cached = db.lectures[cacheKey];
  // 新しい投稿が増えたら作り直す（＝投稿がたまるほど講義が育つ）
  if (cached && Date.now() - Date.parse(cached.createdAt) < 7 * DAY && cached.postCount === insights.length) {
    return { area, lecture: cached.data as Lecture };
  }

  const system = await baseSystem("あなたの役割は、指定された東京の街の「商圏」を初心者に講義することです。");
  const content = [
    `講義する場所：${place}`,
    area ? `運営が特に見てほしいポイント：\n${area.hints.map((h) => `- ${h}`).join("\n")}` : "",
    `この街についてのみんなの投稿（AIが読み取った気づき）：\n${formatInsights(insights)}`,
    "東京都外の場所なら isTokyo を false にし、他の項目は空でかまいません。",
    "読み手はデートや友人との街歩きの前に読む人です。専門用語には短い言い換えを添えてください。",
  ]
    .filter(Boolean)
    .join("\n\n");

  const lecture = await askJSON({ system, content, schema: lectureSchema, validator: lectureValidator, effort: "medium" });
  if (lecture.isTokyo) {
    await updateDB((d) => {
      d.lectures[cacheKey] = { data: lecture, postCount: insights.length, createdAt: new Date().toISOString() };
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
      `<講義の内容>\n${JSON.stringify(lecture)}\n</講義の内容>`,
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

// ─────────────────────────────────────────────
// 立地調査
// ─────────────────────────────────────────────

export interface DiagnosisResult {
  diagnosis: Diagnosis;
  point: GeoPoint | null;
  nearby: { id: string; name: string; distance: number }[];
  trend: TrendCache;
  demo: boolean;
}

export async function diagnose(input: { name: string; address: string; genre: string }): Promise<DiagnosisResult> {
  const point = await geocode(input.address);
  const nearby = point ? nearestAreas(point.lat, point.lng, 3) : [];
  const nearbyInfo = nearby.map(({ area, distance }) => ({ id: area.id, name: area.name, distance: Math.round(distance) }));

  if (isDemoMode()) {
    return {
      diagnosis: demoDiagnosis(input.name, input.address, input.genre),
      point,
      nearby: nearbyInfo,
      trend: await getTrend(input.genre),
      demo: true,
    };
  }

  const trend = await getTrend(input.genre);
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
    `<${input.genre}の最新トレンド（SNS巡回）>\n${trend.report}\n</${input.genre}の最新トレンド>`,
    "",
    `評価軸は必ず ${INDICATORS.join("・")} の5つをこの順で出してください。`,
    "3を「平均的」とし、根拠が乏しい場合は3に寄せ、その旨を caveats に書いてください。",
    "この店について知らない場合は、店名と業態から一般的な店として評価し、知っているふりをしないでください。",
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
  return { diagnosis, point, nearby: nearbyInfo, trend, demo: false };
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
