import { formatAnalysis, readAnalysis } from "./analyses";
import { AREAS, getArea } from "./areas";
import { askJSON, isDemoMode } from "./claude";
import { GENRE_SLUGS, GENRES } from "./constants";
import { GLOSSARY } from "./glossary";
import { baseSystem } from "./knowledge";
import { exerciseSchema, exerciseValidator, type ExerciseComment } from "./schemas";
import { readDB, updateDB } from "./store";

// 商圏そのものを学ぶ → 商圏を考える：東京のランダムな場所の出店問題。
// 全48エリアの分析から、街・商圏・業態をランダムに選んで問題にし、答えにAIがコメントする。

/** APIキーがあるときの、1人1日あたりのコメントの回数 */
export const EXERCISE_PER_DAY = 10;

const GENRE_CHOICES = GENRES.filter((g) => g !== "その他");

export interface ExerciseProblem {
  id: string;
  areaId: string;
  areaName: string;
  genre: string;
  zone: { name: string; area: string; character: string; peak: string; anchor: { lat: number; lng: number; radiusM: number } };
  question: string;
  /** 考えるときのヒント（講義の分析から） */
  hints: { label: string; text: string }[];
}

function slugOf(genre: string): string {
  return GENRE_SLUGS[genre as keyof typeof GENRE_SLUGS] ?? "other";
}

function genreOf(slug: string): string | undefined {
  return Object.entries(GENRE_SLUGS).find(([, s]) => s === slug)?.[0];
}

/** id（街.商圏の番号.業態）から問題を組み立てる */
export async function problemById(id: string): Promise<ExerciseProblem | null> {
  const [areaId, zi, slug] = id.split(".");
  const area = getArea(areaId);
  const genre = genreOf(slug);
  const a = area ? await readAnalysis(area.id) : null;
  const zone = a?.zones[Number(zi)];
  if (!area || !a || !zone || !genre) return null;

  const slot = zone.peak === "夜" ? null : a.daytime.slots.find((s) => s.where.includes(zone.name.slice(0, 3))) ?? a.daytime.slots[1];
  const night = zone.peak === "夜" || zone.peak === "昼夜" ? a.nightlife?.districts[0] : undefined;
  const rel = a.relations.find((r) => r.places.some((p) => zone.character.includes(p.slice(0, 3)) || zone.area.includes(p.slice(0, 3)))) ?? a.relations[0];

  return {
    id,
    areaId: area.id,
    areaName: area.name,
    genre,
    zone: { name: zone.name, area: zone.area, character: zone.character, peak: zone.peak, anchor: zone.anchor },
    question: `${area.name}の「${zone.name}」（${zone.area}）に、${genre}の店を出すとします。どんな客を狙い、どんな店にしますか？ 近くのどの店・施設や人の流れを味方にできるかも考えてみましょう。`,
    hints: [
      { label: "この商圏の性格", text: `${zone.character}（にぎわう時間：${zone.peak}）` },
      { label: "街を支える人", text: a.supporters.slice(0, 2).map((s) => `${s.who}（${s.need}）`).join("／") },
      ...(slot ? [{ label: `昼の街（${slot.time}）`, text: `${slot.who}が${slot.where}に。${slot.scene}` }] : []),
      ...(night ? [{ label: "夜の街", text: `${night.name}：${night.atmosphere}` }] : []),
      { label: `店と店の関係（${rel.type}）`, text: `${rel.places.join(" → ")}：${rel.flow}` },
    ],
  };
}

/** ランダムな出店問題（前と同じ問題はなるべく避ける） */
export async function randomProblem(exclude?: string): Promise<ExerciseProblem> {
  for (let i = 0; i < 10; i++) {
    const area = AREAS[Math.floor(Math.random() * AREAS.length)];
    const a = await readAnalysis(area.id);
    if (!a || a.zones.length === 0) continue;
    const zi = Math.floor(Math.random() * a.zones.length);
    const genre = GENRE_CHOICES[Math.floor(Math.random() * GENRE_CHOICES.length)];
    const id = `${area.id}.${zi}.${slugOf(genre)}`;
    if (id === exclude) continue;
    const p = await problemById(id);
    if (p) return p;
  }
  throw new Error("問題を作れませんでした");
}

const CONCEPTS: { name: string; words: RegExp }[] = [
  { name: "客層（誰を狙うか）", words: /客|学生|女性|男性|会社員|ワーカー|家族|子ども|シニア|観光|訪日|住民|若者|大人|カップル/ },
  { name: "人の流れ（出口・通り・乗り換え）", words: /出口|駅|流れ|通り|乗り換え|歩|動線|改札/ },
  { name: "店と店の関係（補完・集積・競合）", words: /補完|はしご|集積|競合|ライバル|価格|隣|近く|組|ついで/ },
  { name: "時間帯（昼・夜・平日・休日）", words: /昼|夜|朝|ランチ|休日|平日|週末|時間|夕方/ },
];

/** デモ表示：キーワードから、使えている見かたと足りない見かたを返す */
function demoComment(p: ExerciseProblem, answer: string): ExerciseComment {
  const used = CONCEPTS.filter((c) => c.words.test(answer));
  const missing = CONCEPTS.filter((c) => !c.words.test(answer));
  const terms = GLOSSARY.filter((g) => answer.includes(g.term.split("（")[0].split("・")[0])).map((g) => g.term);
  return {
    good: used.length
      ? `【デモ表示】${used.map((c) => c.name).join("、")}の見かたが入っています。`
      : "【デモ表示】まずは、誰に来てほしい店かをはっきりさせるところから始めましょう。",
    missing: missing.length ? `${missing.map((c) => c.name).join("、")}についても考えると、答えが商圏らしくなります。` : "四つの見かたがそろっています。",
    hint: p.hints.map((h) => `${h.label}：${h.text}`).slice(0, 2).join(" ／ "),
    model: `たとえば、この商圏は「${p.zone.character}」という場所なので、にぎわう時間（${p.zone.peak}）に来る客に合わせた${p.genre}の店にし、近くの店からの「ついで」の流れを受け取れる場所と商品を考える、という組み立て方があります。APIキーを設定すると、AIが答えの中身に合わせてコメントします。`,
    terms,
  };
}

export async function commentOnAnswer(o: {
  uid: string;
  id: string;
  answer: string;
}): Promise<{ problem: ExerciseProblem; comment: ExerciseComment; remaining: number | null; demo: boolean } | { limit: true }> {
  const problem = await problemById(o.id);
  if (!problem) throw new Error("問題が見つかりません");
  const answer = o.answer.slice(0, 1000);

  if (isDemoMode()) return { problem, comment: demoComment(problem, answer), remaining: null, demo: true };

  const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
  const key = `${o.uid}:${today}`;
  const used = (await readDB()).exerciseUsage[key] ?? 0;
  if (used >= EXERCISE_PER_DAY) return { limit: true };

  const a = await readAnalysis(problem.areaId);
  const system = await baseSystem(
    "あなたの役割は、商圏を学んでいる人の「出店問題」の答えに、やさしく、具体的にコメントする先生です。正解は一つではないので、考え方の良いところを認め、商圏の見かたで深めるきっかけを渡してください。",
  );
  const content = [
    `<問題>\n${problem.question}\n</問題>`,
    `<この商圏>\n${problem.zone.name}（${problem.zone.area}）：${problem.zone.character}（にぎわう時間：${problem.zone.peak}）\n</この商圏>`,
    a ? `<${problem.areaName}の分析>\n${formatAnalysis(a)}\n</${problem.areaName}の分析>` : "",
    `<学んでいる用語>\n${GLOSSARY.map((g) => `${g.term}：${g.short}`).join("\n")}\n</学んでいる用語>`,
    `<答え>\n${answer}\n</答え>`,
    "",
    "コメントの書き方：",
    "- good：答えの中で、商圏の見かた（客層・人の流れ・店と店の関係・時間帯）がよく使えているところを、答えの言葉を引いて認める。",
    "- missing：まだ考えられていない見かたを1〜2個、この商圏の事実を使って示す。",
    "- hint：次に考えると答えが深まる問いを1つ。",
    "- model：考え方の一例を3〜4文で。分析にある実在の店・通り・客層を使う。「正解」ではなく一例として書く。",
    "- terms：答えに関係する用語を、学んでいる用語の中から1〜3個。",
    "- 分析にない事実を作らない。否定的な言い方を避け、学ぶ人が次も考えたくなる言葉で。",
  ]
    .filter(Boolean)
    .join("\n\n");
  const comment = await askJSON({ system, content, schema: exerciseSchema, validator: exerciseValidator, effort: "low" });
  const remaining = await updateDB((d) => {
    d.exerciseUsage[key] = (d.exerciseUsage[key] ?? 0) + 1;
    // 古い日付の回数は消す
    for (const k of Object.keys(d.exerciseUsage)) if (!k.endsWith(today)) delete d.exerciseUsage[k];
    return EXERCISE_PER_DAY - d.exerciseUsage[key];
  });
  return { problem, comment, remaining, demo: false };
}
