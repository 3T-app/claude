// クライアントとサーバーの両方で使う定数（fs などを含めない）

export const INDICATORS = ["集客基盤", "客層の多様性", "消費サイクル", "競合性", "接続性"] as const;
export type Indicator = (typeof INDICATORS)[number];

export const REACTIONS = {
  naruhodo: "👀 なるほど",
  kizuki: "💡 気づき",
  ikitai: "🚶 行ってみたい",
  umasou: "🍽️ うまそう",
} as const;
export type ReactionType = keyof typeof REACTIONS;

// 業態とファイル名（data/trends/<slug>.json）の対応
export const GENRE_SLUGS = {
  "カフェ・喫茶": "cafe",
  "スイーツ・ベーカリー": "sweets",
  "ラーメン・つけ麺": "ramen",
  "居酒屋・バー": "izakaya",
  "定食・食堂": "teishoku",
  "焼肉・ホルモン": "yakiniku",
  "寿司・和食": "washoku",
  "イタリアン・フレンチ": "western",
  "アジア・エスニック": "ethnic",
  "テイクアウト・総菜": "takeout",
  "その他": "other",
} as const;

export const GENRES = Object.keys(GENRE_SLUGS) as (keyof typeof GENRE_SLUGS)[];

/** 流行メモの入力元と、業態を問わないメモ用の区分 */
export const NOTE_SOURCES = ["X", "Instagram", "TikTok", "Muse", "その他"] as const;
export const ALL_GENRES = "全般";

/** AIへの質問の料金（1回・円） */
export const QUESTION_PRICE_YEN = 100;

/** みんなの投稿の場所（全国どこでも投稿できる） */
export const PREFECTURES = [
  "北海道", "青森県", "岩手県", "宮城県", "秋田県", "山形県", "福島県",
  "茨城県", "栃木県", "群馬県", "埼玉県", "千葉県", "東京都", "神奈川県",
  "新潟県", "富山県", "石川県", "福井県", "山梨県", "長野県", "岐阜県", "静岡県", "愛知県",
  "三重県", "滋賀県", "京都府", "大阪府", "兵庫県", "奈良県", "和歌山県",
  "鳥取県", "島根県", "岡山県", "広島県", "山口県",
  "徳島県", "香川県", "愛媛県", "高知県",
  "福岡県", "佐賀県", "長崎県", "熊本県", "大分県", "宮崎県", "鹿児島県", "沖縄県",
] as const;
export type Prefecture = (typeof PREFECTURES)[number];

/** 投稿の気づきが、店と店のどんな関係か */
export const INSIGHT_RELATIONS = ["補完（はしご）", "補完（呼び込み・時間帯）", "集積", "価格競争", "その他"] as const;
export type InsightRelation = (typeof INSIGHT_RELATIONS)[number];
