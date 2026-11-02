import { postReport } from "../src/lib/postReport";

// みんなの投稿を、都道府県ごと・組み合わせごとにまとめて表示する（全国版のための分析）。
// 使い方：npm run report:posts（アプリを動かしているパソコンの data/db.json を読む）

async function main() {
  const r = await postReport();
  for (const n of r.notes) console.log(`・${n}`);
  for (const p of r.prefectures) {
    console.log(`\n【${p.prefecture}】投稿 ${p.posts} 件（直近30日 ${p.recent} 件）・気づき ${p.insights} 件・リアクション ${p.reactions}`);
    console.log(`  場所：${p.places.join("、")}`);
    const rel = Object.entries(p.relations).filter(([, n]) => n > 0).map(([k, n]) => `${k} ${n}`).join("／");
    if (rel) console.log(`  関係：${rel}`);
    if (p.pairs.length) console.log(`  組み合わせ：${p.pairs.map((x) => `${x.pair}（${x.count}）`).join("、")}`);
    for (const t of p.top) console.log(`  👍${t.reactions} ${t.place}：${t.summary}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
