"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import MapView from "@/components/MapView";
import { Card, DemoBanner, ErrorNote } from "@/components/ui";
import { getArea } from "@/lib/areas";
import type { ExerciseProblem } from "@/lib/exercise";
import { GLOSSARY, GLOSSARY_CATEGORIES, type GlossaryCategory } from "@/lib/glossary";
import type { ExerciseComment } from "@/lib/schemas";
import { zoneColor } from "@/lib/zoneColors";

// 商圏そのものを学ぶ：用語・概念カード と 商圏を考える（ランダムな出店問題）

type Tab = "cards" | "think";

export default function BasicsPage() {
  const [tab, setTab] = useState<Tab>("cards");
  return (
    <div className="pb-6">
      <div className="px-4 pt-5">
        <Link href="/learn" className="text-sm text-ink-soft">
          ← 街を選ぶ
        </Link>
        <p className="mt-3 text-[11px] font-bold tracking-widest text-accent">商圏をうんちくに</p>
        <h1 className="mt-1 text-2xl font-black">商圏そのものを学ぶ</h1>
        <p className="mt-1 text-sm leading-relaxed text-ink-soft">
          用語と考え方をカードで覚えて、東京のランダムな場所の出店問題で使ってみよう。
        </p>
      </div>

      <div className="sticky top-0 z-[500] mt-4 flex gap-2 bg-background px-4 py-2">
        {(
          [
            ["cards", "📇 用語・概念カード"],
            ["think", "🧠 商圏を考える"],
          ] as [Tab, string][]
        ).map(([t, label]) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-xl py-2.5 text-sm font-black ${tab === t ? "bg-foreground text-white" : "border border-line bg-card"}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="px-4 pt-2">{tab === "cards" ? <Cards /> : <Think />}</div>
    </div>
  );
}

function Cards() {
  const [cat, setCat] = useState<GlossaryCategory | "all">("all");
  const [open, setOpen] = useState<string | null>(null);
  const terms = GLOSSARY.filter((g) => cat === "all" || g.category === cat);
  return (
    <div>
      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-2">
        {(["all", ...GLOSSARY_CATEGORIES] as (GlossaryCategory | "all")[]).map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            className={`shrink-0 rounded-full border px-3 py-1 text-xs font-bold ${cat === c ? "border-foreground bg-foreground text-white" : "border-line bg-card"}`}
          >
            {c === "all" ? "すべて" : c}
          </button>
        ))}
      </div>
      <p className="mb-2 text-[11px] text-ink-soft">カードをタップすると、くわしい説明と「この現象が見られる街」が出ます。</p>
      <div className="space-y-2">
        {terms.map((g) => {
          const shown = open === g.id;
          return (
            <Card key={g.id} className={shown ? "border-foreground" : ""}>
              <button className="w-full text-left" onClick={() => setOpen(shown ? null : g.id)}>
                <span className="rounded bg-accent-soft px-1.5 py-0.5 text-[10px] font-bold text-accent">{g.category}</span>
                <p className="mt-1 text-base font-black">{g.term}</p>
                <p className="text-sm text-ink-soft">{g.short}</p>
              </button>
              {shown && (
                <div className="mt-2 border-t border-line pt-2">
                  <p className="text-sm leading-relaxed">{g.body}</p>
                  <p className="mt-2 text-xs font-black">この現象が見られる街</p>
                  <ul className="mt-1 space-y-1.5">
                    {g.examples.map((e) => (
                      <li key={e.areaId} className="text-xs leading-relaxed">
                        <Link href={`/learn/${e.areaId}`} className="font-bold text-accent underline">
                          {getArea(e.areaId)?.name ?? e.areaId}
                        </Link>
                        ：{e.text}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function Think() {
  const [problem, setProblem] = useState<ExerciseProblem | null>(null);
  const [demo, setDemo] = useState(false);
  const [perDay, setPerDay] = useState<number | null>(null);
  const [answer, setAnswer] = useState("");
  const [comment, setComment] = useState<ExerciseComment | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const next = useCallback(async (exclude?: string) => {
    setBusy(true);
    setError("");
    setComment(null);
    setAnswer("");
    try {
      const r = await fetch(`/api/exercise${exclude ? `?exclude=${encodeURIComponent(exclude)}` : ""}`);
      const j = await r.json();
      if (!r.ok) setError(j.error ?? "問題を作れませんでした。");
      else {
        setProblem(j.problem);
        setDemo(j.demo);
        setPerDay(j.perDay);
      }
    } catch {
      setError("通信に失敗しました。");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void next();
  }, [next]);

  async function submit() {
    if (!problem || !answer.trim()) return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/exercise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: problem.id, answer }),
      });
      const j = await r.json();
      if (!r.ok) setError(j.error ?? "コメントを作れませんでした。");
      else {
        setComment(j.comment);
        setRemaining(j.remaining);
      }
    } catch {
      setError("通信に失敗しました。");
    } finally {
      setBusy(false);
    }
  }

  if (!problem) return <p className="py-6 text-sm text-ink-soft">{error || "問題を選んでいます…"}</p>;

  return (
    <div className="space-y-3">
      {demo && <DemoBanner />}
      <Card className="border-foreground">
        <p className="text-[11px] font-bold text-ink-soft">🗾 今回の出店問題</p>
        <p className="mt-1 text-lg font-black">
          {problem.areaName}・{problem.zone.name}
        </p>
        <p className="mt-0.5 flex flex-wrap gap-1">
          <span className="rounded bg-foreground px-1.5 py-0.5 text-[10px] font-bold text-white">{problem.genre}</span>
          <span className="rounded bg-background px-1.5 py-0.5 text-[10px] font-bold">にぎわう時間：{problem.zone.peak}</span>
        </p>
        <p className="mt-2 text-[15px] font-bold leading-relaxed">{problem.question}</p>
      </Card>

      <div className="-mx-4 border-y border-line">
        <MapView
          center={[problem.zone.anchor.lat, problem.zone.anchor.lng]}
          zoom={16}
          className="h-56 w-full"
          zones={[{ number: 1, label: problem.zone.name, color: zoneColor(0), polygon: null, circle: problem.zone.anchor }]}
        />
        <p className="px-4 py-1 text-[10px] text-ink-soft">円はこの商圏のおおよその範囲です</p>
      </div>

      <details className="rounded-2xl border border-line bg-card px-4 py-3">
        <summary className="cursor-pointer text-sm font-black text-accent">💡 ヒント（講義の分析から）</summary>
        <ul className="mt-2 space-y-2">
          {problem.hints.map((h) => (
            <li key={h.label} className="text-sm leading-relaxed">
              <b>{h.label}</b>
              <br />
              {h.text}
            </li>
          ))}
        </ul>
        <Link href={`/learn/${problem.areaId}`} className="mt-2 block text-xs font-bold text-accent underline">
          {problem.areaName}の講義を読む →
        </Link>
      </details>

      <Card>
        <p className="text-sm font-black">✏️ あなたの答え</p>
        <p className="mt-0.5 text-[11px] text-ink-soft">誰を狙うか・どの人の流れを使うか・近くのどの店と組むか・いつ売るか、を入れると商圏らしい答えになります。</p>
        <textarea
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          maxLength={1000}
          rows={5}
          placeholder="例：駅の出口から流れてくる会社員を狙って、昼は…、夜は…。近くの〇〇の客がついでに寄れるように…"
          className="mt-2 w-full resize-none rounded-xl border border-line bg-background px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <button
          onClick={submit}
          disabled={busy || !answer.trim()}
          className="mt-2 w-full rounded-xl bg-accent py-3 text-sm font-black text-white disabled:opacity-40"
        >
          {busy && !comment ? "AIがコメントを書いています…" : "AIにコメントをもらう"}
        </button>
        {perDay !== null && (
          <p className="mt-1 text-center text-[10px] text-ink-soft">
            コメントは1日{perDay}回まで無料{remaining !== null ? `（今日はあと${remaining}回）` : ""}
          </p>
        )}
      </Card>

      {error && <ErrorNote message={error} />}

      {comment && (
        <Card className="border-accent">
          <p className="text-sm font-black text-accent">🧑‍🏫 コメント</p>
          <div className="mt-2 space-y-2.5 text-sm leading-relaxed">
            <p>
              <b>👍 よいところ</b>
              <br />
              {comment.good}
            </p>
            <p>
              <b>🔍 まだ考えられること</b>
              <br />
              {comment.missing}
            </p>
            <p>
              <b>❓ 次に考えてみよう</b>
              <br />
              {comment.hint}
            </p>
            <p className="rounded-xl bg-background p-3">
              <b>📝 考え方の一例</b>
              <br />
              {comment.model}
            </p>
            {comment.terms.length > 0 && (
              <p className="text-xs">
                <b>関係する用語：</b>
                {comment.terms.join("・")}
              </p>
            )}
          </div>
        </Card>
      )}

      <button
        onClick={() => next(problem.id)}
        disabled={busy}
        className="w-full rounded-xl border border-foreground py-2.5 text-sm font-bold disabled:opacity-40"
      >
        🎲 別の場所で問題を出す
      </button>
    </div>
  );
}
