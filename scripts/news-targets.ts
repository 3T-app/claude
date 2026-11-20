// 今日深く巡回する街（48エリアを6日で1周。日本時間の日付で決める）
// 実行：npm run news:targets
import { AREAS } from "../src/lib/areas";

const GROUPS = 6;
const jst = new Date(Date.now() + 9 * 3600 * 1000);
const day = Math.floor(jst.getTime() / 86400000);
const group = day % GROUPS;
const targets = AREAS.filter((_, i) => i % GROUPS === group);
console.log(`日付（日本時間）：${jst.toISOString().slice(0, 10)}　グループ ${group + 1}/${GROUPS}`);
for (const a of targets) console.log(`${a.id}\t${a.name}`);
