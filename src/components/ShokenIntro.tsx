"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

// 初期画面（商圏を学ぼう）のいちばん上に出す「商圏ってなに？」の説明。
// 例は data/analyses/ikebukuro.json（釣具店）と、用語カード（src/lib/glossary.ts）の内容だけを使う。

const KEY = "shoken-intro-open";

export default function ShokenIntro() {
  const [open, setOpen] = useState(true);
  useEffect(() => {
    try {
      if (localStorage.getItem(KEY) === "0") setOpen(false);
    } catch {}
  }, []);
  const toggle = () => {
    setOpen((v) => {
      try {
        localStorage.setItem(KEY, v ? "0" : "1");
      } catch {}
      return !v;
    });
  };

  return (
    <section className="mx-4 mb-3 rounded-2xl border border-foreground bg-card p-4">
      <button onClick={toggle} className="flex w-full items-start justify-between gap-3 text-left" aria-expanded={open}>
        <div>
          <p className="text-[11px] font-bold text-accent">まずはここから</p>
          <p className="mt-0.5 text-base font-black">商圏（しょうけん）ってなに？</p>
          <p className="mt-1 text-sm leading-relaxed">
            <span className="font-bold">その店が、どこまでの範囲からお客さんを集められるか</span>
            ──その範囲のことを「商圏」といいます。
          </p>
        </div>
        <span className="shrink-0 pt-1 text-xs font-bold text-ink-soft">{open ? "閉じる ▲" : "ひらく ▼"}</span>
      </button>

      {open && (
        <div className="mt-3 space-y-4 text-sm leading-relaxed">
          <figure className="flex items-center gap-3">
            <RingFigure />
            <figcaption className="space-y-2 text-xs leading-relaxed">
              <p>
                <span className="font-bold">一次商圏</span>
                <br />
                近くに住んでいて、歩きや自転車で毎日のように来るお客さん
              </p>
              <p>
                <span className="font-bold">二次商圏</span>
                <br />
                電車などに乗って、ときどき来るお客さん
              </p>
            </figcaption>
          </figure>

          <div>
            <p className="font-bold">商圏の広さは、店と場所で変わる</p>
            <ul className="mt-1 list-disc space-y-1 pl-5 text-ink-soft">
              <li>
                <span className="text-foreground">何を売る店か</span>：毎日の買い物の店は近くのお客さんで成り立ち、めずらしい物の専門店には遠くからも人が来る
              </li>
              <li>
                <span className="text-foreground">駅と人の流れ</span>：乗り換えの多い駅や、出口から人が流れる通りの店ほど、遠くの人の目にとまる
              </li>
              <li>
                <span className="text-foreground">まわりの店</span>：同じ種類の店が集まると比べに来る人が増え（集積）、相性のいい店がとなりにあると、はしごで人が来る（補完）
              </li>
            </ul>
          </div>

          <div className="border-l-2 border-foreground pl-3">
            <p className="font-bold">たとえば、池袋の釣具店</p>
            <p className="mt-1 text-ink-soft">
              池袋は東武東上線・西武池袋線で埼玉方面とつながる玄関口。埼玉の川へ釣りに行く人が乗り換えのついでに道具をそろえるので、西口と東口の両方に釣具店があります。東西で値段を比べられることが、釣りに行く人がわざわざ池袋を通る理由になり、池袋の釣具店の商圏は、埼玉の川までのびているのです。
            </p>
          </div>

          <div>
            <p className="font-bold">このアプリでできること</p>
            <ul className="mt-1 space-y-1.5">
              <li>
                <span className="font-bold">🗺️ 商圏を学ぼう</span>
                <span className="text-ink-soft">：東京の街ごとに、どんな商圏がどこにあるかを地図と講義で学ぶ（この画面）</span>
              </li>
              <li>
                <Link href="/diagnose" className="font-bold underline underline-offset-2">
                  📍 立地調査
                </Link>
                <span className="text-ink-soft">：店の住所から、その店の商圏の広さと強さを5つの指標で測る</span>
              </li>
              <li>
                <Link href="/board" className="font-bold underline underline-offset-2">
                  💬 みんなの投稿
                </Link>
                <span className="text-ink-soft">：街で気づいた商圏を、写真つきで教え合う</span>
              </li>
            </ul>
          </div>
        </div>
      )}
    </section>
  );
}

/** 店を真ん中に、一次商圏・二次商圏を線だけで描いた図 */
function RingFigure() {
  return (
    <svg viewBox="0 0 120 120" className="h-28 w-28 shrink-0" role="img" aria-label="店を中心に、内側が一次商圏、外側が二次商圏">
      <circle cx="60" cy="60" r="56" fill="none" stroke="currentColor" strokeWidth="1.2" strokeDasharray="4 3" />
      <circle cx="60" cy="60" r="30" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="60" cy="60" r="4" fill="var(--accent)" />
      <text x="60" y="74" textAnchor="middle" fontSize="9" fontWeight="700" fill="currentColor">
        店
      </text>
      <text x="60" y="47" textAnchor="middle" fontSize="8" fill="currentColor">
        一次商圏
      </text>
      <text x="60" y="21" textAnchor="middle" fontSize="8" fill="currentColor">
        二次商圏
      </text>
    </svg>
  );
}
