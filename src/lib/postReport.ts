import { getArea } from "./areas";
import { INDICATORS, INSIGHT_RELATIONS } from "./constants";
import { postPlaceName, postPrefecture } from "./posts";
import { readDB, reactionCount, type Post } from "./store";

// みんなの投稿を、都道府県ごと・関係の種類ごとにまとめる（全国版のための分析）。
// 人が「気づいた」組み合わせは補完関係が強い証拠なので、どの店の種類の組み合わせが
// どの地域で多く見つかっているかを数える。

export interface PrefectureSummary {
  prefecture: string;
  posts: number;
  insights: number;
  reactions: number;
  /** 直近30日の投稿 */
  recent: number;
  places: string[];
  indicators: Record<string, number>;
  relations: Record<string, number>;
  /** よく見つかる店の種類の組み合わせ */
  pairs: { pair: string; count: number }[];
  top: { place: string; summary: string; mechanism: string; relation: string; reactions: number }[];
}

export interface PostReport {
  total: number;
  tokyo48: number;
  outside: number;
  prefectures: PrefectureSummary[];
  /** 全国で多い組み合わせ（2つ以上の都道府県で見つかったものを先に） */
  pairs: { pair: string; count: number; prefectures: string[] }[];
  notes: string[];
}

const pairKey = (pair: string[]) => [...pair].map((x) => x.trim()).filter(Boolean).sort().join("×");

export async function postReport(): Promise<PostReport> {
  const db = await readDB();
  const since = Date.now() - 30 * 24 * 3600_000;
  const byPref = new Map<string, Post[]>();
  for (const p of db.posts) {
    const pref = postPrefecture(p);
    byPref.set(pref, [...(byPref.get(pref) ?? []), p]);
  }

  const allPairs = new Map<string, { count: number; prefectures: Set<string> }>();
  const prefectures: PrefectureSummary[] = [...byPref.entries()].map(([prefecture, posts]) => {
    const withInsight = posts.filter((p) => p.insight);
    const indicators = Object.fromEntries(INDICATORS.map((i) => [i, withInsight.filter((p) => p.insight!.indicator === i).length]));
    const relations = Object.fromEntries(INSIGHT_RELATIONS.map((r) => [r, withInsight.filter((p) => (p.insight!.relation ?? "その他") === r).length]));
    const pairs = new Map<string, number>();
    for (const p of withInsight) {
      const k = pairKey(p.insight!.pair ?? []);
      if (!k.includes("×")) continue;
      pairs.set(k, (pairs.get(k) ?? 0) + 1);
      const all = allPairs.get(k) ?? { count: 0, prefectures: new Set<string>() };
      all.count += 1;
      all.prefectures.add(prefecture);
      allPairs.set(k, all);
    }
    return {
      prefecture,
      posts: posts.length,
      insights: withInsight.length,
      reactions: posts.reduce((n, p) => n + reactionCount(p), 0),
      recent: posts.filter((p) => Date.parse(p.createdAt) >= since).length,
      places: [...new Set(posts.map((p) => postPlaceName(p)))].slice(0, 12),
      indicators,
      relations,
      pairs: [...pairs.entries()].map(([pair, count]) => ({ pair, count })).sort((a, b) => b.count - a.count).slice(0, 5),
      top: withInsight
        .sort((a, b) => reactionCount(b) + b.insight!.quality - (reactionCount(a) + a.insight!.quality))
        .slice(0, 3)
        .map((p) => ({ place: postPlaceName(p), summary: p.insight!.summary, mechanism: p.insight!.mechanism, relation: p.insight!.relation ?? "その他", reactions: reactionCount(p) })),
    };
  });
  prefectures.sort((a, b) => b.posts - a.posts);

  const tokyo48 = db.posts.filter((p) => getArea(p.areaId)).length;
  const outside = db.posts.length - tokyo48;
  const pairs = [...allPairs.entries()]
    .map(([pair, v]) => ({ pair, count: v.count, prefectures: [...v.prefectures] }))
    .sort((a, b) => b.prefectures.length - a.prefectures.length || b.count - a.count)
    .slice(0, 10);

  const notes: string[] = [];
  notes.push(`投稿は全部で ${db.posts.length} 件（東京の48の街 ${tokyo48} 件、それ以外 ${outside} 件、${prefectures.length} 都道府県）。`);
  const others = prefectures.filter((p) => p.prefecture !== "東京都" && p.prefecture !== "不明");
  if (others.length === 0) notes.push("東京以外の投稿はまだありません。全国版のために、地方の街の投稿を集めましょう。");
  else notes.push(`東京以外では ${others.slice(0, 5).map((p) => `${p.prefecture} ${p.posts}件`).join("、")} の順に多く投稿されています。`);
  const shared = pairs.filter((p) => p.prefectures.length >= 2);
  if (shared.length) notes.push(`複数の都道府県で見つかった組み合わせ：${shared.slice(0, 5).map((p) => `${p.pair}（${p.prefectures.join("・")}）`).join("、")}。地域を問わず効く補完関係の候補です。`);

  return { total: db.posts.length, tokyo48, outside, prefectures, pairs, notes };
}
