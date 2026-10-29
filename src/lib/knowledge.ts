import { readDB, reactionCount, type Indicator, type Post } from "./store";
import { getArea } from "./areas";

// 「育成」のしくみ：モデル自体は再学習せず、
//   1) 運営が書いた教え（teachings）
//   2) 掲示板の投稿からAIが抽出した気づき（insight）をリアクション数で重みづけしたもの
// を毎回プロンプトに差し込む。投稿とリアクションが増えるほど、講義と診断が街の実態に寄っていく。

export async function getTeachings(): Promise<string> {
  const db = await readDB();
  return db.teachings.trim();
}

function score(p: Post): number {
  return (p.insight?.quality ?? 1) + reactionCount(p) * 0.5;
}

export async function findInsights(opts: { areaIds?: string[]; indicator?: Indicator; limit?: number }) {
  const db = await readDB();
  return db.posts
    .filter((p) => p.insight)
    .filter((p) => !opts.areaIds || opts.areaIds.includes(p.areaId))
    .filter((p) => !opts.indicator || p.insight!.indicator === opts.indicator)
    .sort((a, b) => score(b) - score(a))
    .slice(0, opts.limit ?? 12);
}

export function formatInsights(posts: Post[]): string {
  if (posts.length === 0) return "（まだ投稿はありません）";
  return posts
    .map((p) => {
      const area = getArea(p.areaId)?.name ?? p.areaId;
      const i = p.insight!;
      return `- [${area}｜${i.indicator}｜リアクション${reactionCount(p)}] ${i.summary}（なぜ効くか：${i.mechanism}）`;
    })
    .join("\n");
}

/** すべてのAI呼び出しの system に入れる共通の前提 */
export async function baseSystem(role: string): Promise<string> {
  const teachings = await getTeachings();
  return [
    role,
    "あなたは東京の商圏に詳しい案内役です。テーマは「商圏をうんちくに」。",
    "数字や固有名詞は確かなものだけを使い、不確かなことは傾向として述べてください。",
    "",
    "<運営からの教え>",
    teachings || "（未設定）",
    "</運営からの教え>",
  ].join("\n");
}
