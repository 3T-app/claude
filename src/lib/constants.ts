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
