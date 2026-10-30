// data/news/ の形式を検証する。実行：npm run check:news
import { promises as fs } from "fs";
import path from "path";
import { getArea } from "../src/lib/areas";
import { GENRES, ALL_GENRES } from "../src/lib/constants";
import { areaNewsValidator, buzzValidator } from "../src/lib/news";

(async () => {
  const dir = path.join(process.cwd(), "data", "news");
  let ng = 0;
  let areas = 0;
  let items = 0;
  const date = /^\d{4}-\d{2}-\d{2}$/;
  for (const f of await fs.readdir(path.join(dir, "areas")).catch(() => [] as string[])) {
    if (!f.endsWith(".json")) continue;
    const p = areaNewsValidator.safeParse(JSON.parse(await fs.readFile(path.join(dir, "areas", f), "utf8")));
    const id = f.replace(/\.json$/, "");
    const issues: string[] = [];
    if (!p.success) issues.push(p.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join(" / "));
    else {
      if (p.data.areaId !== id || !getArea(id)) issues.push(`areaId ${p.data.areaId}`);
      for (const i of p.data.items) {
        if (!date.test(i.date)) issues.push(`日付 ${i.date}`);
        if (!/^https?:\/\//.test(i.url)) issues.push(`URL ${i.url}`);
      }
      items += p.data.items.length;
    }
    areas++;
    if (issues.length) {
      ng++;
      console.log(`NG areas/${f}: ${issues.join(" / ")}`);
    }
  }
  try {
    const p = buzzValidator.safeParse(JSON.parse(await fs.readFile(path.join(dir, "buzz.json"), "utf8")));
    if (!p.success) {
      ng++;
      console.log(`NG buzz.json: ${p.error.issues.map((i) => `${i.path.join(".")} ${i.message}`).join(" / ")}`);
    } else {
      const genres = [ALL_GENRES, ...GENRES] as string[];
      for (const i of p.data.items) {
        if (!genres.includes(i.genre)) {
          ng++;
          console.log(`NG buzz.json: 業態「${i.genre}」は GENRES にありません`);
        }
        if (!date.test(i.date) || !/^https?:\/\//.test(i.url)) {
          ng++;
          console.log(`NG buzz.json: ${i.title} の日付かURL`);
        }
      }
      console.log(`buzz.json：${p.data.items.length}件`);
    }
  } catch {
    console.log("buzz.json：なし");
  }
  console.log(`街のニュース：${areas}エリア・${items}件`);
  process.exitCode = ng ? 1 : 0;
})();
