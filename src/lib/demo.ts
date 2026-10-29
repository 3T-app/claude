import type { Area } from "./areas";
import type { Diagnosis, Lecture } from "./schemas";
import { INDICATORS, type PostInsight } from "./store";

// APIキーが未設定のときに画面の流れを確認するための仮の応答。
// 内容は運営の hints から組み立てるので、街ごとに少しずつ違う表示になる。

function hash(s: string): number {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

export function demoLecture(area: Area | null, place: string): Lecture {
  const hints = area?.hints ?? [`${place}の商圏データはデモモードでは用意されていません。`];
  return {
    isTokyo: true,
    placeName: area?.name ?? place,
    headline: area?.catch ?? `${place}の商圏を歩いてみよう`,
    overview: `【デモ表示】${hints.join("。")}。APIキーを設定すると、AIがこの街の商圏を詳しく講義します。`,
    zones: hints.slice(0, 3).map((h, i) => ({ name: `ゾーン${i + 1}`, description: h })),
    timeShift: {
      morning: "通勤・通学の通過需要。コーヒーとパンが動く時間。",
      daytime: "ランチ需要と、買い物・観光の来街者。",
      night: "仕事帰りの飲食と、夜の目的来店。",
      weekend: "平日とは客層が入れ替わり、滞在時間が長くなる。",
    },
    customers: "デモ表示：APIキー設定後に、この街の客層とニーズを解説します。",
    connections: "デモ表示：駅からの動線と、店同士の「ついで」の組み合わせを解説します。",
    unchiku: hints.slice(0, 3).map((h) => ({ line: h.split("。")[0], explanation: "デモ表示のうんちくです。" })),
    walkRoute: "駅を出たら、まず人の流れが一番多い方向へ。次に一本裏の通りへ入り、客層の変化を感じてみよう。",
    communityNote: "",
  };
}

export function demoDiagnosis(name: string, address: string, genre: string): Diagnosis {
  const h = hash(name + address);
  return {
    storeUnderstanding: `【デモ表示】「${name}」（${genre}）を ${address} の店として仮に評価しています。`,
    locationSummary: "APIキーを設定すると、周辺の商圏・投稿・トレンドを踏まえて分析します。",
    scores: INDICATORS.map((indicator, i) => ({
      indicator,
      score: ((h >>> (i * 3)) % 5) + 1,
      reason: "デモ表示のため点数は仮のものです。",
      advice: "APIキー設定後に、具体的な改善策を提示します。",
    })),
    overall: "デモ表示です。実際の分析には ANTHROPIC_API_KEY の設定が必要です。",
    buzzMenus: [
      { name: "小さめサイズの看板メニュー", why: "一人客・食べ歩き需要に合わせる例", priceHint: "500〜800円" },
      { name: "時間帯限定セット", why: "昼と夜の客層の入れ替わりを取り込む例", priceHint: "1,000円前後" },
      { name: "近隣店とのコラボ商品", why: "接続性を商品にする例", priceHint: "—" },
    ],
    trendFit: "デモ表示：トレンド巡回の結果がここに入ります。",
    caveats: "デモ表示の点数はランダムです。",
  };
}

export function demoInsight(comment: string): PostInsight {
  return {
    indicator: INDICATORS[hash(comment) % INDICATORS.length],
    summary: comment.slice(0, 60),
    mechanism: "デモ表示：APIキー設定後、AIが写真とコメントから立地のしくみを読み取ります。",
    tags: [],
    quality: 2,
  };
}

export function demoTrend(genre: string) {
  return {
    report: `【デモ表示】${genre}のトレンドは、APIキー設定後にWeb検索で巡回して取得します。Claude Code で /crawl-trends を実行して data/trends/ に保存することもできます。`,
    sources: [],
  };
}

export function demoChat(question: string): string {
  return `【デモ表示】「${question}」への回答は、APIキーを設定すると AI が講義の内容とみんなの投稿をもとに答えます。`;
}
