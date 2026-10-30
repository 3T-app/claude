import { z } from "zod";
import { INDICATORS } from "./constants";

// 構造化出力で使うJSONスキーマ（API側）と、受け取り後の検証（zod）を対で定義する。

const str = { type: "string" } as const;
const strArr = { type: "array", items: str } as const;

function obj(properties: Record<string, unknown>) {
  return { type: "object", properties, required: Object.keys(properties), additionalProperties: false };
}

// ── 商圏講義 ──
// 分析手順（data/teachings.md）：支える人とニーズ → 地図の店 → 歴史と名残 → 新しい勢力 → 店と店の関係 → 商圏の割れ方 → 昼と夜 → まとめ

export const RELATION_TYPES = ["補完（はしご）", "補完（呼び込み・時間帯）", "集積", "価格競争"] as const;

const anchor = obj({
  lat: { type: "number", description: "商圏の中心の緯度（地図の店データから推定）" },
  lng: { type: "number", description: "商圏の中心の経度" },
  radiusM: { type: "integer", description: "おおよその広がり（m）。50〜600" },
});

export const lectureSchema = obj({
  isTokyo: { type: "boolean", description: "対象が東京都内の場所ならtrue" },
  placeName: str,
  headline: { type: "string", description: "この街の商圏を一言で表すキャッチ（30字以内）" },
  conclusion: { type: "string", description: "まとめ。「つまり〇〇は、昼は〜、夜は〜で栄える商圏だ」のように結論を2〜4文で" },
  supporters: {
    type: "array",
    description: "町を支える人・世帯とそのニーズ。統計とニュースを根拠に3〜5個",
    items: obj({
      who: { type: "string", description: "誰が（例：埼玉方面からの来街者、一人暮らしの若者、オフィスワーカー）" },
      need: { type: "string", description: "何を求めて来る・住むのか" },
      evidence: { type: "string", description: "根拠（統計の数字、ニュース、地図の店の分布など）" },
    }),
  },
  zones: {
    type: "array",
    description: "商圏の割れ方。街を3〜7個の商圏に分ける（例：アニメ商圏、電気街商圏、夜の繁華街）。地図に色分けで表示する",
    items: obj({
      name: { type: "string", description: "商圏の名前（例：アニメ商圏）" },
      area: { type: "string", description: "場所（例：東口サンシャイン60通り〜乙女ロード）" },
      character: { type: "string", description: "どんな商圏か。集まっている店、客層、担い手（老舗・若手の独立店・チェーン）を2〜3文で" },
      peak: { type: "string", enum: ["昼", "夜", "昼夜", "休日"] },
      poiIds: { ...strArr, description: "この商圏に属する店のid（地図の店一覧のid）。代表的なものを3〜25個。一覧にない場合は空" },
      anchor,
    }),
  },
  relations: {
    type: "array",
    description: "店と店の関係。実在の店の組み合わせで4〜8個",
    items: obj({
      type: { type: "string", enum: [...RELATION_TYPES] },
      places: { ...strArr, description: "関係する店・施設の名前（順番に使われる場合はその順）" },
      poiIds: { ...strArr, description: "places に対応する店のid（地図の店一覧にあるもの）" },
      flow: { type: "string", description: "人の流れ・関係（例：遊ぶ → 食べる → 甘いもので締める）" },
      who: { type: "string", description: "誰がその流れを使うか" },
      effect: { type: "string", description: "両方の店にとっての効果" },
    }),
  },
  history: {
    type: "array",
    description: "町の歴史と、その名残が今どこにどう残っているか。古い順に3〜5個",
    items: obj({ period: str, event: str, remnant: { type: "string", description: "今に残る名残（場所と様子）" } }),
  },
  newForces: {
    type: "array",
    description: "新しい勢力と今の魅力（再開発、新しい大型店、新しい客層など）。2〜4個",
    items: obj({ period: str, event: str, effect: str }),
  },
  contrasts: {
    type: "array",
    description: "出口・通りごとの違い（例：西口と東口）。1〜3個",
    items: obj({ sideA: str, sideB: str, difference: str }),
  },
  dayNight: obj({
    day: { type: "string", description: "昼に街を支える商圏と人" },
    night: { type: "string", description: "夜に街を支える商圏と人" },
  }),
  unchiku: {
    type: "array",
    description: "デートや雑談でそのまま使える商圏うんちく。3つ",
    items: obj({ line: { type: "string", description: "会話で言う一言" }, explanation: str }),
  },
  walkRoute: { type: "string", description: "商圏の割れ方と補完関係を体感できる歩き方" },
  communityNote: { type: "string", description: "みんなの投稿から分かること。投稿がなければ空文字" },
});

const anchorV = z.object({ lat: z.number(), lng: z.number(), radiusM: z.number() });
export const lectureValidator = z.object({
  isTokyo: z.boolean(),
  placeName: z.string(),
  headline: z.string(),
  conclusion: z.string(),
  supporters: z.array(z.object({ who: z.string(), need: z.string(), evidence: z.string() })),
  zones: z.array(
    z.object({
      name: z.string(),
      area: z.string(),
      character: z.string(),
      peak: z.enum(["昼", "夜", "昼夜", "休日"]),
      poiIds: z.array(z.string()),
      anchor: anchorV,
    }),
  ),
  relations: z.array(
    z.object({
      type: z.enum(RELATION_TYPES),
      places: z.array(z.string()),
      poiIds: z.array(z.string()),
      flow: z.string(),
      who: z.string(),
      effect: z.string(),
    }),
  ),
  history: z.array(z.object({ period: z.string(), event: z.string(), remnant: z.string() })),
  newForces: z.array(z.object({ period: z.string(), event: z.string(), effect: z.string() })),
  contrasts: z.array(z.object({ sideA: z.string(), sideB: z.string(), difference: z.string() })),
  dayNight: z.object({ day: z.string(), night: z.string() }),
  unchiku: z.array(z.object({ line: z.string(), explanation: z.string() })),
  walkRoute: z.string(),
  communityNote: z.string(),
});
export type LectureAI = z.infer<typeof lectureValidator>;

/** 画面に渡す講義。AIの出力に、地図で描く形（色分けの多角形・関係の線）と出典を足したもの */
export interface Lecture extends LectureAI {
  center: { lat: number; lng: number } | null;
  map: {
    zones: { polygon: [number, number][] | null; circle: { lat: number; lng: number; radiusM: number } }[];
    relations: { points: [number, number][] }[];
  };
  sources: { title: string; url: string }[];
  dataUsed: { osm: boolean; hotpepper: boolean; estat: boolean };
}

// ── 立地診断 ──
export const diagnosisSchema = obj({
  storeUnderstanding: { type: "string", description: "店名・住所・業態から読み取った店の姿" },
  locationSummary: { type: "string", description: "この場所の商圏の特徴" },
  zoneFit: obj({
    zoneName: { type: "string", description: "店が属する商圏の名前（街の商圏の割れ方から。なければ自分で名付ける）" },
    position: { type: "string", enum: ["中心", "端", "外"] },
    reading: { type: "string", description: "その商圏のどの客・どの時間帯の流れを受けられる位置か。2〜3文" },
  }),
  relations: {
    type: "array",
    description: "この店と周りの店・施設との関係。実在の店で3〜6個",
    items: obj({
      type: { type: "string", enum: ["補完（はしご）", "補完（呼び込み・時間帯）", "集積", "価格競争"] },
      partners: { ...strArr, description: "相手の店・施設の名前" },
      poiIds: { ...strArr, description: "partners に対応する店のid（周辺の店一覧にあるもの）" },
      flow: { type: "string", description: "人の流れ（例：映画の後 → この店で雑談）" },
      howToUse: { type: "string", description: "この関係を売上につなげる具体策" },
    }),
  },
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
  zoneFit: z.object({ zoneName: z.string(), position: z.enum(["中心", "端", "外"]), reading: z.string() }),
  relations: z.array(
    z.object({
      type: z.enum(RELATION_TYPES),
      partners: z.array(z.string()),
      poiIds: z.array(z.string()),
      flow: z.string(),
      howToUse: z.string(),
    }),
  ),
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
