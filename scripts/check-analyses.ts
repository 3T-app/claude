// data/analyses/*.json を検証する：形式、48エリアのそろい具合、商圏の位置が街から離れすぎていないか
// 実行：npm run check:analyses
import { promises as fs } from "fs";
import path from "path";
import { AREAS, distanceM } from "../src/lib/areas";
import { storedAnalysisValidator } from "../src/lib/analyses";

(async () => {
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
    if (issues.length) {
      problems++;
      console.log(`NG ${area.id}: ${issues.join(" / ")}`);
    } else done.push(area.id);
  }
  const missing = AREAS.filter((a) => !done.includes(a.id)).map((a) => a.id);
  console.log(`OK ${done.length}/${AREAS.length}`);
  if (missing.length) console.log(`未作成・要修正：${missing.join(", ")}`);
  process.exitCode = problems ? 1 : 0;
})();
