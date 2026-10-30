// data/analyses/*.json を検証する：形式、48エリアのそろい具合、商圏の位置が街から離れすぎていないか
// 実行：npm run check:analyses
import { promises as fs } from "fs";
import path from "path";
import { AREAS, distanceM } from "../src/lib/areas";
import { storedAnalysisValidator } from "../src/lib/analyses";

const GENERIC_TITLES = ["歴史", "町の歴史", "街の歴史", "商圏の割れ方", "新しい勢力", "昼と夜", "まとめ", "店と店の関係", "町を支える人"];

(async () => {
  const templated: string[] = [];
  const dir = path.join(process.cwd(), "data", "analyses");
  let problems = 0;
  const done: string[] = [];
  for (const area of AREAS) {
    let raw: string;
    try {
      raw = await fs.readFile(path.join(dir, `${area.id}.json`), "utf8");
    } catch {
      continue;
    }
    const parsed = storedAnalysisValidator.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      problems++;
      console.log(`NG ${area.id}: ${parsed.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join(" / ")}`);
      continue;
    }
    const a = parsed.data;
    const issues: string[] = [];
    if (a.zones.length < 3 || a.zones.length > 7) issues.push(`商圏の数 ${a.zones.length}`);
    for (const z of a.zones) {
      const d = distanceM(area.lat, area.lng, z.anchor.lat, z.anchor.lng);
      if (d > 2000) issues.push(`${z.name} が中心から ${Math.round(d)}m`);
    }
    if (a.relations.length < 3) issues.push(`店と店の関係 ${a.relations.length}`);
    if (a.unchiku.length !== 3) issues.push(`うんちく ${a.unchiku.length}`);
    // 講義がテンプレートにならないように：切り口・街ごとの見出し・決まり文句でないまとめ
    if (a.angle.length < 15) issues.push("切り口が短い");
    if (a.chapters.length < 3 || a.chapters.length > 5) issues.push(`章の数 ${a.chapters.length}`);
    for (const c of a.chapters) {
      if (GENERIC_TITLES.some((g) => c.title.replace(/[「」、。]/g, "") === g)) issues.push(`汎用の見出し「${c.title}」`);
      if (c.body.length < 80) issues.push(`章「${c.title}」が短い`);
    }
    if (/^つまり.+は、昼は/.test(a.conclusion)) templated.push(area.id);
    if (issues.length) {
      problems++;
      console.log(`NG ${area.id}: ${issues.join(" / ")}`);
    } else done.push(area.id);
  }
  const missing = AREAS.filter((a) => !done.includes(a.id)).map((a) => a.id);
  console.log(`OK ${done.length}/${AREAS.length}`);
  if (missing.length) console.log(`未作成・要修正：${missing.join(", ")}`);
  // 「つまり〇〇は、昼は〜」の型は、昼夜で語るのが合う街だけに使う（多すぎたら警告）
  if (templated.length > 6) {
    problems++;
    console.log(`NG まとめが「つまり〇〇は、昼は〜」の型の街が ${templated.length} か所（6か所まで）：${templated.join(", ")}`);
  }
  process.exitCode = problems ? 1 : 0;
})();
