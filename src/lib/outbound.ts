import { createHash } from "crypto";
import { getArea } from "./areas";
import { readAreaNews } from "./news";
import { readDB, updateDB } from "./store";

// 外部リンク（飲み屋街の「お店を探す」→ Google マップ）の踏み込み数を日ごとに記録し、
// 平均からの増減を分析する。個人は残さず、日ごとの回数と、重複を数えるための短いハッシュだけを持つ。

export const OUTBOUND_KINDS = ["nightlife-maps"] as const;
export type OutboundKind = (typeof OUTBOUND_KINDS)[number];

/** 記録を残す日数 */
const KEEP_DAYS = 180;

export interface OutboundDay {
  /** 「種類|街のid|飲み屋街の名前」ごとの回数 */
  [key: string]: { clicks: number; users: string[] };
}

function dayJST(d = new Date()): string {
  return new Date(d.getTime() + 9 * 3600_000).toISOString().slice(0, 10);
}

function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const hashUid = (uid: string) => createHash("sha256").update(uid).digest("hex").slice(0, 12);

export async function recordOutbound(o: { uid: string; kind: OutboundKind; areaId: string; label: string }) {
  const date = dayJST();
  const key = `${o.kind}|${o.areaId}|${o.label.slice(0, 60)}`;
  const user = hashUid(o.uid);
  await updateDB((db) => {
    const day = (db.outbound[date] ??= {});
    const row = (day[key] ??= { clicks: 0, users: [] });
    row.clicks += 1;
    if (!row.users.includes(user)) row.users.push(user);
    const oldest = addDays(date, -KEEP_DAYS);
    for (const d of Object.keys(db.outbound)) if (d < oldest) delete db.outbound[d];
  });
}

export interface OutboundTarget {
  key: string;
  areaId: string;
  areaName: string;
  label: string;
  /** 直近7日（今日を含まない）の合計 */
  last7: number;
  /** その前の28日の、7日あたりの平均 */
  base7: number;
  /** 増減の割合（base7 が 0 のときは null） */
  changePct: number | null;
}

export interface OutboundReport {
  today: string;
  daily: { date: string; clicks: number; users: number }[];
  todayClicks: number;
  /** 昨日までの7日の1日平均 */
  avg7: number;
  /** その前の28日の1日平均 */
  avg28: number;
  changePct: number | null;
  /** 曜日ごとの1日平均（日〜土） */
  weekday: number[];
  rising: OutboundTarget[];
  falling: OutboundTarget[];
  top: OutboundTarget[];
  /** 増減の理由の手がかり：増えた・減った街の最近のニュース */
  newsHints: { areaName: string; date: string; title: string; kind: string }[];
  notes: string[];
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const pct = (now: number, base: number) => (base > 0 ? Math.round(((now - base) / base) * 100) : null);

/** 日ごとの記録から、平均・増減・よく押された飲み屋街をまとめる */
export async function outboundReport(days = 56): Promise<OutboundReport> {
  const db = await readDB();
  const today = dayJST();
  const dates = Array.from({ length: days }, (_, i) => addDays(today, i - days + 1));
  const daily = dates.map((date) => {
    const day = db.outbound[date] ?? {};
    const rows = Object.values(day);
    return { date, clicks: rows.reduce((n, r) => n + r.clicks, 0), users: new Set(rows.flatMap((r) => r.users)).size };
  });
  const past = daily.slice(0, -1); // 今日はまだ途中なので平均に入れない
  const last7 = past.slice(-7);
  const prev28 = past.slice(-35, -7);
  const sum = (a: { clicks: number }[]) => a.reduce((n, d) => n + d.clicks, 0);
  const avg7 = last7.length ? sum(last7) / last7.length : 0;
  const avg28 = prev28.length ? sum(prev28) / prev28.length : 0;

  const weekdayTotals = Array(7).fill(0);
  const weekdayCounts = Array(7).fill(0);
  // 記録が始まる前の日は、曜日の平均に入れない
  const first = Object.keys(db.outbound).sort()[0];
  for (const d of past.filter((x) => first && x.date >= first)) {
    const w = new Date(`${d.date}T00:00:00Z`).getUTCDay();
    weekdayTotals[w] += d.clicks;
    weekdayCounts[w] += 1;
  }

  // 飲み屋街ごと：直近7日と、その前の28日の7日あたり平均
  const last7Dates = new Set(last7.map((d) => d.date));
  const prev28Dates = new Set(prev28.map((d) => d.date));
  const byKey = new Map<string, { last7: number; prev28: number }>();
  for (const [date, day] of Object.entries(db.outbound)) {
    for (const [key, row] of Object.entries(day)) {
      const v = byKey.get(key) ?? { last7: 0, prev28: 0 };
      if (last7Dates.has(date)) v.last7 += row.clicks;
      if (prev28Dates.has(date)) v.prev28 += row.clicks;
      byKey.set(key, v);
    }
  }
  const targets: OutboundTarget[] = [...byKey.entries()].map(([key, v]) => {
    const [, areaId, label] = key.split("|");
    const base7 = round1((v.prev28 / 28) * 7);
    return { key, areaId, areaName: getArea(areaId)?.name ?? areaId, label, last7: v.last7, base7, changePct: pct(v.last7, base7) };
  });
  // 少なすぎる回数の増減は偶然が大きいので、合わせて5回以上のものだけを比べる
  const enough = targets.filter((t) => t.last7 + t.base7 >= 5);
  const rising = enough.filter((t) => t.last7 > t.base7 * 1.3).sort((a, b) => b.last7 - b.base7 - (a.last7 - a.base7)).slice(0, 5);
  const falling = enough.filter((t) => t.last7 < t.base7 * 0.7).sort((a, b) => a.last7 - a.base7 - (b.last7 - b.base7)).slice(0, 5);
  const top = [...targets].sort((a, b) => b.last7 - a.last7).filter((t) => t.last7 > 0).slice(0, 10);

  // 増減した街の最近のニュースを、理由の手がかりとして添える
  const since = addDays(today, -21);
  const newsHints: OutboundReport["newsHints"] = [];
  for (const areaId of new Set([...rising, ...falling].map((t) => t.areaId))) {
    const news = await readAreaNews(areaId);
    for (const n of news.filter((x) => x.date >= since).slice(0, 3)) {
      newsHints.push({ areaName: getArea(areaId)?.name ?? areaId, date: n.date, title: n.title, kind: n.kind });
    }
  }

  const changePct = pct(avg7, avg28);
  const notes: string[] = [];
  const todayClicks = daily[daily.length - 1]?.clicks ?? 0;
  if (sum(past) === 0)
    notes.push(
      todayClicks > 0
        ? `今日から記録が始まりました（今日 ${todayClicks} 回）。1日平均は明日から、増減の比べ方は記録が5週間たまってから出ます。`
        : "まだ記録がありません。飲み屋街の「お店を探す」が押されると、ここに日ごとの回数が出ます。",
    );
  else {
    if (prev28.every((d) => d.clicks === 0)) notes.push("比べる前の期間（8〜35日前）の記録がまだないため、増減は記録が5週間たまってから比べられます。");
    else if (changePct !== null && Math.abs(changePct) >= 20)
      notes.push(`直近7日の1日平均は ${round1(avg7)} 回で、その前の4週間（${round1(avg28)} 回）より ${changePct > 0 ? `${changePct}% 増えました` : `${-changePct}% 減りました`}。`);
    else notes.push(`直近7日の1日平均は ${round1(avg7)} 回で、その前の4週間（${round1(avg28)} 回）とほぼ同じです。`);
    const wAvg = weekdayTotals.map((t, i) => (weekdayCounts[i] ? t / weekdayCounts[i] : 0));
    const names = ["日", "月", "火", "水", "木", "金", "土"];
    const best = wAvg.indexOf(Math.max(...wAvg));
    if (wAvg[best] > 0) notes.push(`曜日では${names[best]}曜日が一番多く押されています（1日平均 ${round1(wAvg[best])} 回）。`);
    for (const t of rising) notes.push(`増加：${t.areaName}「${t.label}」 直近7日 ${t.last7} 回（いつもは7日で ${t.base7} 回）`);
    for (const t of falling) notes.push(`減少：${t.areaName}「${t.label}」 直近7日 ${t.last7} 回（いつもは7日で ${t.base7} 回）`);
  }

  return {
    today,
    daily,
    todayClicks,
    avg7: round1(avg7),
    avg28: round1(avg28),
    changePct,
    weekday: weekdayTotals.map((t, i) => (weekdayCounts[i] ? round1(t / weekdayCounts[i]) : 0)),
    rising,
    falling,
    top,
    newsHints,
    notes,
  };
}
