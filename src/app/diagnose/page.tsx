"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import MapView from "@/components/MapView";
import { Card, DemoBanner, ErrorNote, PageHeader } from "@/components/ui";
import { AREAS } from "@/lib/areas";
import type { DiagnosisResult } from "@/lib/features";
import { GENRES } from "@/lib/constants";

const STEPS = ["住所を地図に置いています", "SNSのトレンドを巡回しています", "みんなの投稿を照らし合わせています", "5つの軸で評価しています"];

export default function DiagnosePage() {
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [genre, setGenre] = useState<string>(GENRES[0]);
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const [result, setResult] = useState<DiagnosisResult | null>(null);

  useEffect(() => {
    if (!loading) return;
    setStep(0);
    const t = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 9000);
    return () => clearInterval(t);
  }, [loading]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !address.trim()) {
      setError("店名と住所を入力してください。");
      return;
    }
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const r = await fetch("/api/diagnose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, address, genre }),
      });
      const j = await r.json();
      if (!r.ok) setError(j.error ?? "診断に失敗しました。");
      else setResult(j);
    } catch {
      setError("通信に失敗しました。");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <PageHeader title="立地調査" sub="お店の住所と店名を入れてください。AIが商圏から5段階で診断し、バズるメニューを提案します。" />

      <form onSubmit={submit} className="mx-4 space-y-3">
        <Card className="space-y-3">
          <label className="block">
            <span className="text-xs font-bold">店名</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例：〇〇ジェラート 自由が丘店"
              className="mt-1 w-full rounded-xl border border-line bg-background px-3 py-2.5 text-sm outline-none focus:border-accent"
            />
          </label>
          <label className="block">
            <span className="text-xs font-bold">住所</span>
            <input
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="例：東京都目黒区自由が丘1-2-3"
              className="mt-1 w-full rounded-xl border border-line bg-background px-3 py-2.5 text-sm outline-none focus:border-accent"
            />
          </label>
          <label className="block">
            <span className="text-xs font-bold">業態</span>
            <select
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
              className="mt-1 w-full rounded-xl border border-line bg-background px-3 py-2.5 text-sm outline-none focus:border-accent"
            >
              {GENRES.map((g) => (
                <option key={g}>{g}</option>
              ))}
            </select>
          </label>
        </Card>
        <button disabled={loading} className="w-full rounded-xl bg-accent py-3.5 font-black text-white disabled:opacity-50">
          {loading ? "分析中…" : "決定して分析する"}
        </button>
      </form>

      {loading && (
        <div className="mx-4 mt-5 space-y-2">
          {STEPS.map((s, i) => (
            <p key={s} className={`flex items-center gap-2 text-sm ${i <= step ? "text-foreground" : "text-ink-soft/50"}`}>
              <span>{i < step ? "✅" : i === step ? "⏳" : "・"}</span>
              {s}
            </p>
          ))}
          <p className="pt-1 text-xs text-ink-soft">Web検索を含むため1分ほどかかることがあります。</p>
        </div>
      )}

      {error && (
        <div className="mt-4">
          <ErrorNote message={error} />
        </div>
      )}

      {result && <Report result={result} name={name} />}
    </div>
  );
}

function ScoreMeter({ score }: { score: number }) {
  return (
    <div className="flex gap-0.5" role="img" aria-label={`5段階中${score}`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={`h-2.5 flex-1 first:rounded-l last:rounded-r ${n <= score ? "bg-accent" : "bg-accent-soft"}`} />
      ))}
    </div>
  );
}

function Report({ result, name }: { result: DiagnosisResult; name: string }) {
  const { diagnosis: d, point, nearby, trend } = result;
  const avg = d.scores.reduce((n, s) => n + s.score, 0) / d.scores.length;
  const [open, setOpen] = useState<string | null>(d.scores[0]?.indicator ?? null);
  const nearbyAreas = nearby.map((n) => AREAS.find((a) => a.id === n.id)).filter((a) => !!a);

  return (
    <div className="mt-6 space-y-4 pb-4">
      {result.demo && <DemoBanner />}

      <div className="px-4">
        <p className="text-xs font-bold text-ink-soft">診断レポート</p>
        <h2 className="text-xl font-black">{name}</h2>
        <div className="mt-3 flex items-end gap-2">
          <span className="text-6xl leading-none font-black">{avg.toFixed(1)}</span>
          <span className="pb-1 text-sm text-ink-soft">/ 5　総合（5軸の平均）</span>
        </div>
      </div>

      {point && (
        <div className="overflow-hidden border-y border-line">
          <MapView
            center={[point.lat, point.lng]}
            zoom={15}
            className="h-56 w-full"
            markers={[
              ...nearbyAreas.map((a) => ({ id: a.id, lat: a.lat, lng: a.lng, label: a.name, color: "#1f2328" })),
              { id: "store", lat: point.lat, lng: point.lng, label: name, emphasis: true },
            ]}
            circles={[
              { lat: point.lat, lng: point.lng, radius: 300, color: "#e8532f", label: "半径300m（徒歩約4分）" },
              { lat: point.lat, lng: point.lng, radius: 800, color: "#3b5bdb", label: "半径800m（徒歩約10分）" },
            ]}
          />
          {point.approximate && <p className="px-4 py-1 text-[11px] text-ink-soft">※位置は街の中心による概算です</p>}
        </div>
      )}

      <div className="space-y-4 px-4">
        <Card>
          <h3 className="text-sm font-black">5つの軸の評価</h3>
          <ul className="mt-3 divide-y divide-line">
            {d.scores.map((s) => (
              <li key={s.indicator} className="py-2.5">
                <button className="w-full text-left" onClick={() => setOpen(open === s.indicator ? null : s.indicator)}>
                  <div className="flex items-baseline justify-between">
                    <span className="text-sm font-bold">{s.indicator}</span>
                    <span className="text-lg font-black">
                      {s.score}
                      <span className="text-xs font-normal text-ink-soft"> / 5</span>
                    </span>
                  </div>
                  <div className="mt-1.5">
                    <ScoreMeter score={s.score} />
                  </div>
                </button>
                {open === s.indicator && (
                  <div className="mt-2 space-y-1.5 text-xs leading-relaxed">
                    <p>{s.reason}</p>
                    {s.advice && (
                      <p className="rounded-lg bg-background p-2">
                        <b>改善のヒント：</b>
                        {s.advice}
                      </p>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <h3 className="text-sm font-black text-accent">分析レポート</h3>
          <p className="mt-2 text-xs text-ink-soft">{d.storeUnderstanding}</p>
          <p className="mt-2 text-sm leading-relaxed">{d.locationSummary}</p>
          <p className="mt-3 text-sm leading-relaxed font-bold">{d.overall}</p>
        </Card>

        <div>
          <h3 className="mb-2 text-sm font-black">🔥 この立地でバズりそうなメニュー</h3>
          <div className="space-y-2">
            {d.buzzMenus.map((m, i) => (
              <Card key={i} className="p-3">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="font-black">{m.name}</p>
                  <p className="shrink-0 text-xs text-ink-soft">{m.priceHint}</p>
                </div>
                <p className="mt-1 text-xs leading-relaxed">{m.why}</p>
              </Card>
            ))}
          </div>
        </div>

        <Card>
          <h3 className="text-sm font-black text-accent">📈 {trend.genre}で今はやっているもの</h3>
          <p className="mt-1 text-[11px] text-ink-soft">
            {trend.by === "claude-code" ? "Claude Code の巡回" : trend.by === "api" ? "AIのWeb巡回" : "デモ"}・
            {new Date(trend.fetchedAt).toLocaleDateString("ja-JP")}時点
          </p>
          <p className="mt-2 text-sm leading-relaxed font-bold">{d.trendFit}</p>
          <details className="mt-3">
            <summary className="cursor-pointer text-xs font-bold text-ink-soft">巡回したトレンドの全文</summary>
            <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed">{trend.report}</p>
            {trend.sources.length > 0 && (
              <ul className="mt-2 space-y-1">
                {trend.sources.map((s) => (
                  <li key={s.url}>
                    <a href={s.url} target="_blank" rel="noreferrer" className="text-[11px] text-accent underline">
                      {s.title || s.url}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </details>
        </Card>

        <p className="text-[11px] leading-relaxed text-ink-soft">⚠️ {d.caveats}</p>

        {nearbyAreas.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {nearbyAreas.map((a) => (
              <Link key={a.id} href={`/learn/${a.id}`} className="rounded-full border border-line bg-card px-3 py-1 text-xs font-bold">
                {a.name}の商圏を学ぶ →
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
