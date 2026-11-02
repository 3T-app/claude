import { promises as fs } from "fs";
import path from "path";
import { DATA_DIR, readDB, reactionCount, type Indicator, type Post } from "./store";
import { distanceM } from "./areas";
import { postPlaceName } from "./posts";

// 「育成」のしくみ：モデル自体は再学習せず、
//   1) 運営が書いた教え（teachings）
//   2) 掲示板の投稿からAIが抽出した気づき（insight）をリアクション数で重みづけしたもの
// を毎回プロンプトに差し込む。投稿とリアクションが増えるほど、講義と診断が街の実態に寄っていく。

async function readText(file: string): Promise<string> {
  try {
    return await fs.readFile(path.join(DATA_DIR, file), "utf8");
  } catch {
    return "";
  }
}

/** /admin で編集されていればそれを、されていなければ data/teachings.md を使う */
export async function getTeachings(): Promise<string> {
  const db = await readDB();
  return (db.teachingsEdited ? db.teachings : await readText("teachings.md")).trim();
}

/** 運営の現地調査メモ（街ごと）。/admin で編集されていればそれを、なければ data/area-notes/<id>.md */
export async function getAreaNote(areaId: string): Promise<string> {
  if (!/^[a-z0-9-]+$/.test(areaId)) return "";
  const db = await readDB();
  return (db.areaNotes[areaId] ?? (await readText(`area-notes/${areaId}.md`))).trim();
}

function score(p: Post): number {
  return (p.insight?.quality ?? 1) + reactionCount(p) * 0.5;
}

/**
 * 投稿の気づきを探す。areaIds（東京の48の街）か near（全国どこでも、位置から半径）で場所を絞り、
 * keywords（業態の言葉など）や relation（補完の関係だけ）で中身を絞る
 */
export async function findInsights(opts: {
  areaIds?: string[];
  near?: { lat: number; lng: number; radiusM: number };
  indicator?: Indicator;
  keywords?: string[];
  complementOnly?: boolean;
  limit?: number;
}) {
  const db = await readDB();
  const inArea = (p: Post) => !!opts.areaIds?.includes(p.areaId);
  const isNear = (p: Post) =>
    !!opts.near && p.place?.lat != null && p.place.lng != null && distanceM(opts.near.lat, opts.near.lng, p.place.lat, p.place.lng) <= opts.near.radiusM;
  const text = (p: Post) => [p.comment, p.insight!.summary, p.insight!.mechanism, ...(p.insight!.tags ?? []), ...(p.insight!.pair ?? [])].join(" ");
  return db.posts
    .filter((p) => p.insight)
    .filter((p) => (!opts.areaIds && !opts.near) || inArea(p) || isNear(p))
    .filter((p) => !opts.indicator || p.insight!.indicator === opts.indicator)
    .filter((p) => !opts.complementOnly || p.insight!.relation?.startsWith("補完"))
    .filter((p) => !opts.keywords?.length || opts.keywords.some((k) => text(p).includes(k)))
    .sort((a, b) => score(b) - score(a))
    .slice(0, opts.limit ?? 12);
}

export function formatInsights(posts: Post[]): string {
  if (posts.length === 0) return "（まだ投稿はありません）";
  return posts
    .map((p) => {
      const i = p.insight!;
      const rel = i.relation && i.relation !== "その他" ? `｜${i.relation}${i.pair?.length ? `：${i.pair.join("×")}` : ""}` : "";
      return `- [${postPlaceName(p)}｜${i.indicator}${rel}｜リアクション${reactionCount(p)}] ${i.summary}（なぜ効くか：${i.mechanism}）`;
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
