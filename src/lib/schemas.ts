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

/** 「もっと詳しく」の中で最初に開いておく項目（＝その街の分析の主役） */
export const FOCUS_TYPES = ["支える人", "商圏の割れ方", "店と店の関係", "歴史と名残", "新しい勢力", "通りの違い", "昼と夜"] as const;
export type FocusType = (typeof FOCUS_TYPES)[number];

/** 昼の街の時間帯 */
export const DAY_SLOTS = ["朝", "ランチ", "午後", "休日の昼"] as const;

const anchor = obj({
  lat: { type: "number", description: "商圏の中心の緯度（地図の店データから推定）" },
  lng: { type: "number", description: "商圏の中心の経度" },
  radiusM: { type: "integer", description: "おおよその広がり（m）。50〜600" },
});

export const lectureSchema = obj({
  isTokyo: { type: "boolean", description: "対象が東京都内の場所ならtrue" },
  placeName: str,
  headline: { type: "string", description: "この街の商圏を一言で表すキャッチ（30字以内）" },
  angle: { type: "string", description: "この街を読む切り口。他の街と違う、この街ならではの見方を一文で（例：地形、東西の逆転、ブランドの循環）" },
  focus: { type: "string", enum: [...FOCUS_TYPES], description: "この街の分析で一番の主役になる項目" },
  chapters: {
    type: "array",
    description: "読み物としての本文。この街の切り口に沿った3〜4章。見出しはこの街だけの具体的な言葉にし、「商圏の割れ方」「歴史」のような汎用の見出しは使わない",
    items: obj({
      title: { type: "string", description: "この街だけの見出し（20字以内）" },
      body: { type: "string", description: "3〜5文。具体的な店・通り・年を入れ、語り口に変化をつける" },
    }),
  },
  conclusion: { type: "string", description: "ひとことで言うとどんな街か。2〜3文。決まった言い回しを避け、この街の切り口に合った言葉で" },
  whatsNew: {
    ...strArr,
    description: "前回の講義からの変化（新しい投稿・リアクション・ニュース・調査メモで分かったこと）を1〜3個。前回がない、または変化がなければ空配列",
  },
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
  daytime: obj({
    summary: { type: "string", description: "昼の街をひとことで（誰が、どこに、何をしに来るか）。1〜2文" },
    slots: {
      type: "array",
      description: "時間帯ごとの昼の街。朝・ランチ・午後・休日の昼の4つ",
      items: obj({
        time: { type: "string", enum: [...DAY_SLOTS] },
        who: { type: "string", description: "その時間に街にいる人" },
        where: { type: "string", description: "どの商圏・通り・店に集まるか（実在の名前）" },
        scene: { type: "string", description: "どんな光景か、なぜそこに集まるか（商圏の理由）を1〜2文" },
        tip: { type: "string", description: "その時間に街を歩く人へのひとこと（狙い目・混む場所など）" },
      }),
    },
  }),
  unchiku: {
    type: "array",
    description:
      "会話デッキ。商圏を知らない人の興味を引く3つ。その街のイメージと違う店・ものが、なぜそこにあって成り立っているのかを、商圏（客層・集積・補完・歴史・人の流れ）で説明する（例：池袋に釣具屋が多いのはなぜ？→埼玉方面へ川釣りに行く人の玄関口だから）",
    items: obj({
      line: { type: "string", description: "会話で投げかける問い（「なんで〜なの？」「〜って知ってる？」の形）。答えは書かない" },
      explanation: { type: "string", description: "答え。その店・ものが成り立つ理由を、商圏の仕組みで2〜3文" },
    }),
  },
  walkRoute: { type: "string", description: "商圏の割れ方と補完関係を体感できる歩き方" },
  communityNote: { type: "string", description: "みんなの投稿から分かること。投稿がなければ空文字" },
});

const anchorV = z.object({ lat: z.number(), lng: z.number(), radiusM: z.number() });
export const daytimeValidator = z.object({
  summary: z.string(),
  slots: z.array(z.object({ time: z.enum(DAY_SLOTS), who: z.string(), where: z.string(), scene: z.string(), tip: z.string() })),
});
export const lectureValidator = z.object({
  isTokyo: z.boolean(),
  placeName: z.string(),
  headline: z.string(),
  angle: z.string(),
  focus: z.enum(FOCUS_TYPES),
  chapters: z.array(z.object({ title: z.string(), body: z.string() })),
  conclusion: z.string(),
  whatsNew: z.array(z.string()),
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
  daytime: daytimeValidator,
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
  /** Claude Code の事前分析を表示しているとき */
  analyzedBy?: "claude-code";
  analyzedAt?: string;
  /** 日付つきの更新履歴（毎日のニュース巡回・自動分析で追加される） */
  updates: { date: string; text: string }[];
  generatedAt?: string;
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

// ── 飲み屋街（商圏を学ぼう → もっと詳しく → 飲み屋街） ──
// 手順：駅の出口をすべて見つける → 出口から先の人の流れ → 飲み屋街の商圏と雰囲気

export const NIGHT_VIBES = [
  "若者の昼飲み・せんべろ",
  "大衆酒場・会社員",
  "大人の隠れ家",
  "おしゃれなバー・ワイン",
  "高級クラブ・接待",
  "ホスト・キャバクラ街",
  "ガールズバー・コンカフェ",
  "音楽・カルチャー",
  "LGBTQのバー街",
  "観光客・インバウンド",
  "地元の常連・下町",
] as const;
export const BUDGETS = ["安い", "ふつう", "やや高め", "高額"] as const;
export const DIRECTIONS = ["北", "北東", "東", "南東", "南", "南西", "西", "北西"] as const;

export const nightlifeSchema = obj({
  summary: { type: "string", description: "この街の飲み屋街をひとことで。2文" },
  exits: {
    type: "array",
    description: "駅の出口（主なものをすべて）。複数の駅がある街は駅名も入れる。3〜8個",
    items: obj({
      name: { type: "string", description: "出口の名前（例：東口、A3出口、南口（中央線））" },
      poiId: { type: "string", description: "出口一覧にある出口のid。一覧にないときは空文字" },
      dir: { type: "string", enum: [...DIRECTIONS], description: "駅の中心から見た出口の方角" },
      flow: { type: "string", description: "この出口から先に起きている人の流れ（どの通りを、どこへ）" },
      who: { type: "string", description: "その流れをつくっている人（時間帯も）" },
    }),
  },
  districts: {
    type: "array",
    description: "飲み屋街の商圏。2〜6個",
    items: obj({
      name: { type: "string", description: "飲み屋街の名前（例：ハモニカ横丁、歌舞伎町二丁目のホスト街）" },
      area: { type: "string", description: "場所（通り・番地のめやす）" },
      vibe: { type: "string", enum: [...NIGHT_VIBES] },
      target: { type: "string", description: "主な客層（年代・性別・目的）" },
      atmosphere: { type: "string", description: "どんな雰囲気か、なぜそうなったか（商圏・歴史の理由）を2〜3文" },
      budget: { type: "string", enum: [...BUDGETS], description: "予算感" },
      hours: { type: "string", description: "にぎわう時間帯（例：昼14時ごろから、21時〜深夜）" },
      fromExits: { ...strArr, description: "この飲み屋街へ人が流れてくる出口の名前（exits の name）" },
      howToEnjoy: { type: "string", description: "大人の楽しみ方・歩き方" },
      caution: { type: "string", description: "注意すること（客引き、高額請求、ルールなど）。なければ空文字" },
      poiIds: { ...strArr, description: "この飲み屋街に属する店のid（店一覧のid）。一覧にないときは空" },
      anchor,
    }),
  },
  hopping: { type: "string", description: "大人の一晩の回り方（はしごの流れ）。1〜2文" },
});

const exitV = z.object({ name: z.string(), poiId: z.string(), dir: z.enum(DIRECTIONS), flow: z.string(), who: z.string() });
export const nightlifeValidator = z.object({
  summary: z.string(),
  exits: z.array(exitV),
  districts: z.array(
    z.object({
      name: z.string(),
      area: z.string(),
      vibe: z.enum(NIGHT_VIBES),
      target: z.string(),
      atmosphere: z.string(),
      budget: z.enum(BUDGETS),
      hours: z.string(),
      fromExits: z.array(z.string()),
      howToEnjoy: z.string(),
      caution: z.string(),
      poiIds: z.array(z.string()),
      anchor: anchorV,
    }),
  ),
  hopping: z.string(),
});
export type Nightlife = z.infer<typeof nightlifeValidator>;

/** 画面に返す飲み屋街（地図に置く位置つき） */
export interface NightlifeView extends Nightlife {
  map: {
    /** 出口の位置。OpenStreetMap で見つかればその位置、なければ方角からのおおよその位置 */
    exits: { name: string; lat: number; lng: number; approx: boolean }[];
    districts: { polygon: [number, number][] | null; circle: { lat: number; lng: number; radiusM: number } }[];
  };
  source: "claude-code" | "ai" | "demo";
  generatedAt?: string;
  dataUsed: { osmExits: number; osmBars: number };
}
