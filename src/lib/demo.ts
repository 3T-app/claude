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
  const c = area ? { lat: area.lat, lng: area.lng } : null;
  // デモでは中心のまわりに仮の商圏を置き、地図の色分けの見え方だけ確かめられるようにする
  const offsets: [number, number, string, "昼" | "夜" | "昼夜" | "休日"][] = [
    [0.0025, 0.0035, "回遊型の商圏（デモ）", "昼"],
    [-0.0015, -0.003, "夜の繁華街（デモ）", "夜"],
    [-0.003, 0.002, "オフィス・ランチ商圏（デモ）", "昼"],
  ];
  const zones = offsets.map(([dLat, dLng, name, peak], i) => ({
    name,
    area: "デモ表示",
    character: hints[i] ?? "APIキーを設定すると、地図の店の分布からAIが商圏を分けます。",
    peak,
    poiIds: [],
    anchor: { lat: (c?.lat ?? 35.68) + dLat, lng: (c?.lng ?? 139.76) + dLng, radiusM: 250 },
  }));
  return {
    isTokyo: true,
    placeName: area?.name ?? place,
    headline: area?.catch ?? `${place}の商圏を歩いてみよう`,
    conclusion: `【デモ表示】APIキーを設定すると、「つまり${area?.name ?? place}は、昼は〜、夜は〜で栄える商圏だ」という結論を、統計・地図の店・歴史・ニュースから導きます。`,
    supporters: [
      { who: "デモ表示", need: "APIキー設定後に、町を支える世帯とニーズを分析します", evidence: "e-Stat の統計とニュース" },
    ],
    zones,
    relations: [
      {
        type: "補完（はしご）",
        places: ["食事の店", "デザートの店", "カラオケ"],
        poiIds: [],
        flow: "遊ぶ → 食べる → 甘いもので締める（デモ）",
        who: "デモ表示",
        effect: "APIキー設定後に、実在の店の組み合わせで分析します",
      },
    ],
    history: hints.slice(0, 2).map((h) => ({ period: "—", event: h, remnant: "デモ表示" })),
    newForces: [{ period: "—", event: "デモ表示", effect: "APIキー設定後に、再開発や新しい店の動きを調べます" }],
    contrasts: [],
    dayNight: { day: "デモ表示：昼に街を支える商圏", night: "デモ表示：夜に街を支える商圏" },
    unchiku: hints.slice(0, 3).map((h) => ({ line: h.split("。")[0], explanation: "デモ表示のうんちくです。" })),
    walkRoute: "駅を出たら、まず人の流れが一番多い方向へ。次に一本裏の通りへ入り、客層の変化を感じてみよう。",
    communityNote: "",
    center: c,
    map: { zones: zones.map((z) => ({ polygon: null, circle: z.anchor })), relations: [{ points: [] }] },
    sources: [],
    dataUsed: { osm: false, hotpepper: false, estat: false },
  };
}

export function demoDiagnosis(name: string, address: string, genre: string): Diagnosis {
  const h = hash(name + address);
  return {
    storeUnderstanding: `【デモ表示】「${name}」（${genre}）を ${address} の店として仮に評価しています。`,
    locationSummary: "APIキーを設定すると、周辺の商圏・投稿・トレンドを踏まえて分析します。",
    zoneFit: { zoneName: "デモ表示", position: "端", reading: "APIキー設定後に、この店がどの商圏のどの流れを受けられるかを分析します。" },
    relations: [
      {
        type: "補完（はしご）",
        partners: ["近くの食事の店"],
        poiIds: [],
        flow: "食事 → この店（デモ）",
        howToUse: "APIキー設定後に、実在の店との関係から具体策を出します。",
      },
    ],
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
