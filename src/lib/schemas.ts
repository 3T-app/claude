import { z } from "zod";
import { INDICATORS } from "./constants";

// 構造化出力で使うJSONスキーマ（API側）と、受け取り後の検証（zod）を対で定義する。

const str = { type: "string" } as const;
const strArr = { type: "array", items: str } as const;

function obj(properties: Record<string, unknown>) {
  return { type: "object", properties, required: Object.keys(properties), additionalProperties: false };
}

// ── 商圏講義 ──
export const lectureSchema = obj({
  isTokyo: { type: "boolean", description: "対象が東京都内の場所ならtrue" },
  placeName: str,
  headline: { type: "string", description: "この街の商圏を一言で表すキャッチ（30字以内）" },
  overview: { type: "string", description: "街全体の商圏の骨格。3〜4文" },
  zones: {
    type: "array",
    description: "街の中のゾーン（出口・通り・エリア）ごとの性格。3〜5個",
    items: obj({ name: str, description: str }),
  },
  timeShift: obj({ morning: str, daytime: str, night: str, weekend: str }),
  customers: { type: "string", description: "主な客層とそのニーズ" },
  connections: { type: "string", description: "店と店、駅と店の組み合わせで生まれる回遊・ついで需要" },
  unchiku: {
    type: "array",
    description: "デートや雑談でそのまま使える商圏うんちく。3つ",
    items: obj({ line: { type: "string", description: "会話で言う一言" }, explanation: str }),
  },
  walkRoute: { type: "string", description: "商圏を体感できるおすすめの歩き方" },
  communityNote: { type: "string", description: "みんなの投稿から分かること。投稿がなければ空文字" },
});

export const lectureValidator = z.object({
  isTokyo: z.boolean(),
  placeName: z.string(),
  headline: z.string(),
  overview: z.string(),
  zones: z.array(z.object({ name: z.string(), description: z.string() })),
  timeShift: z.object({ morning: z.string(), daytime: z.string(), night: z.string(), weekend: z.string() }),
  customers: z.string(),
  connections: z.string(),
  unchiku: z.array(z.object({ line: z.string(), explanation: z.string() })),
  walkRoute: z.string(),
  communityNote: z.string(),
});
export type Lecture = z.infer<typeof lectureValidator>;

// ── 立地診断 ──
export const diagnosisSchema = obj({
  storeUnderstanding: { type: "string", description: "店名・住所・業態から読み取った店の姿" },
  locationSummary: { type: "string", description: "この場所の商圏の特徴" },
  scores: {
    type: "array",
    description: "5つの評価軸すべてを、この順番で1つずつ",
    items: obj({
      indicator: { type: "string", enum: [...INDICATORS] },
      score: { type: "integer", description: "1〜5の5段階" },
      reason: { type: "string", description: "その点数の根拠" },
      advice: { type: "string", description: "点数を上げるための具体策" },
    }),
  },
  overall: { type: "string", description: "総合所見。3〜5文" },
  buzzMenus: {
    type: "array",
    description: "この立地とトレンドからバズりそうなメニュー案。3つ",
    items: obj({ name: str, why: str, priceHint: str }),
  },
  trendFit: { type: "string", description: "今のトレンドとこの店・立地の相性" },
  caveats: { type: "string", description: "推定に頼った点、現地で確かめるべき点" },
});

const clamp = z.number().transform((n) => Math.min(5, Math.max(1, Math.round(n))));
export const diagnosisValidator = z.object({
  storeUnderstanding: z.string(),
  locationSummary: z.string(),
  scores: z.array(
    z.object({ indicator: z.enum(INDICATORS), score: clamp, reason: z.string(), advice: z.string() }),
  ),
  overall: z.string(),
  buzzMenus: z.array(z.object({ name: z.string(), why: z.string(), priceHint: z.string() })),
  trendFit: z.string(),
  caveats: z.string(),
});
export type Diagnosis = z.infer<typeof diagnosisValidator>;

// ── 投稿の読み取り ──
export const insightSchema = obj({
  relevant: { type: "boolean", description: "商圏・街並み・店の組み合わせに関する気づきならtrue" },
  indicator: { type: "string", enum: [...INDICATORS] },
  summary: { type: "string", description: "気づきの要約（1文）" },
  mechanism: { type: "string", description: "なぜその組み合わせ・立地が客を呼ぶのか（1〜2文）" },
  tags: strArr,
  quality: { type: "integer", description: "他の分析に役立つ度合い。1〜5" },
});

export const insightValidator = z.object({
  relevant: z.boolean(),
  indicator: z.enum(INDICATORS),
  summary: z.string(),
  mechanism: z.string(),
  tags: z.array(z.string()),
  quality: clamp,
});
