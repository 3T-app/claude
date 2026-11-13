import { outboundReport } from "../src/lib/outbound";

// 飲み屋街の「お店を探す」（Google マップへの移動）の回数を、平均と増減でまとめて表示する。
// 使い方：npm run report:clicks（アプリを動かしているパソコンの data/db.json を読む）

async function main() {
  const r = await outboundReport();
  console.log(`お店を探す（Google マップへの移動）の記録　${r.today}`);
  console.log(`今日 ${r.todayClicks} 回／直近7日の1日平均 ${r.avg7} 回／その前の4週間 ${r.avg28} 回${r.changePct === null ? "" : `（${r.changePct >= 0 ? "+" : ""}${r.changePct}%）`}`);
  console.log(`直近14日：${r.daily.slice(-14).map((d) => `${d.date.slice(5)} ${d.clicks}`).join("　")}`);
  console.log(`曜日ごとの1日平均（日〜土）：${r.weekday.join(" / ")}`);
  for (const n of r.notes) console.log(`・${n}`);
  if (r.top.length) console.log(`よく押された飲み屋街：${r.top.map((t) => `${t.areaName}「${t.label}」${t.last7}回`).join("、")}`);
  for (const n of r.newsHints) console.log(`  手がかり：${n.areaName} ${n.date}［${n.kind}］${n.title}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
