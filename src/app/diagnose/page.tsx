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

        <LocalDataCard result={result} />

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

        <TrendCard bundle={trend} genre={trend.web.genre} trendFit={d.trendFit} />

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

const pct = (r: number | null) => (r === null ? "—" : `${Math.round(r * 1000) / 10}%`);

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-xl bg-background p-2.5">
      <p className="text-[11px] text-ink-soft">{label}</p>
      <p className="text-lg font-black">{value}</p>
      {note && <p className="text-[10px] text-ink-soft">{note}</p>}
    </div>
  );
}

/** ホットペッパーとe-Statの数字。AIの点数の根拠として並べて見せる */
function LocalDataCard({ result }: { result: DiagnosisResult }) {
  const { competition: c, city } = result;
  if (!c && !city) {
    return (
      <p className="text-[11px] leading-relaxed text-ink-soft">
        周辺の店の数（ホットペッパー）と街の統計（e-Stat）は、APIキーを設定すると表示され、評価の根拠に使われます。
      </p>
    );
  }
  return (
    <Card>
      <h3 className="text-sm font-black">📊 評価の根拠になったデータ</h3>
      <div className="mt-2 grid grid-cols-2 gap-2">
        {c?.genreName && (
          <>
            <Stat label={`同業（${c.genreName}）300m以内`} value={`${c.sameGenre300}軒`} note="競合性" />
            <Stat label="同業 1km以内" value={`${c.sameGenre1000}軒`} note="競合性" />
          </>
        )}
        {c && <Stat label="飲食店 300m以内（全ジャンル）" value={`${c.all300}軒`} note="集積・接続性" />}
        {city && <Stat label={`一人暮らしの割合（${city.name}）`} value={pct(city.singleRatio)} note="客層の多様性" />}
        {city && (
          <Stat
            label={`昼夜間人口比（${city.name}）`}
            value={city.dayNightRatio === null ? "—" : String(city.dayNightRatio)}
            note="消費サイクル：1を超えるほど昼に人が集まる"
          />
        )}
        {city && <Stat label={`65歳以上の割合（${city.name}）`} value={pct(city.elderlyRatio)} note="客層の多様性" />}
      </div>
      {c && c.genreMix.length > 0 && (
        <p className="mt-3 text-xs leading-relaxed">
          <b>500m以内のジャンル構成：</b>
          {c.genreMix
            .slice(0, 8)
            .map((g) => `${g.genre} ${g.count}`)
            .join("・")}
        </p>
      )}
      {c && c.nearest.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs font-bold text-ink-soft">近くのお店（近い順）</summary>
          <ul className="mt-1 space-y-0.5 text-[11px]">
            {c.nearest.map((s) => (
              <li key={s.name + s.distance}>
                {s.url ? (
                  <a href={s.url} target="_blank" rel="noreferrer" className="underline">
                    {s.name}
                  </a>
                ) : (
                  s.name
                )}
                <span className="text-ink-soft">
                  {" "}
                  {s.genre}・{s.distance}m
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}
      <p className="mt-3 text-[10px] text-ink-soft">
        {c && (
          <>
            <a href="http://webservice.recruit.co.jp/" target="_blank" rel="noreferrer" className="underline">
              Powered by ホットペッパーグルメ Webサービス
            </a>
            {city && "　"}
          </>
        )}
        {city && `出典：政府統計の総合窓口(e-Stat)（${city.year}年）`}
      </p>
    </Card>
  );
}

function TrendCard({ bundle, genre, trendFit }: { bundle: DiagnosisResult["trend"]; genre: string; trendFit: string }) {
  const { web, youtube, notes } = bundle;
  return (
    <Card>
      <h3 className="text-sm font-black text-accent">📈 {genre}で今はやっているもの</h3>
      <p className="mt-2 text-sm leading-relaxed font-bold">{trendFit}</p>

      {notes.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-bold">📝 X・Instagramの流行メモ（運営が収集）</p>
          <ul className="mt-1 space-y-1 text-xs leading-relaxed">
            {notes.slice(0, 6).map((n) => (
              <li key={n.id}>
                <span className="mr-1 rounded bg-foreground px-1 text-[10px] text-white">{n.source}</span>
                {n.text}
                <span className="text-[10px] text-ink-soft">（{n.createdAt.slice(5, 10).replace("-", "/")}）</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {youtube.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer text-xs font-bold">▶️ YouTubeで伸びている動画（直近30日）</summary>
          <ul className="mt-1 space-y-1">
            {youtube.slice(0, 6).map((v) => (
              <li key={v.url} className="text-[11px] leading-relaxed">
                <a href={v.url} target="_blank" rel="noreferrer" className="underline">
                  {v.title}
                </a>
                <span className="text-ink-soft">　{Math.round(v.views / 1000).toLocaleString("ja-JP")}千回</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <details className="mt-3">
        <summary className="cursor-pointer text-xs font-bold text-ink-soft">
          🌐 Web記事の巡回（{web.by === "claude-code" ? "Claude Code" : web.by === "api" ? "AI" : "デモ"}・
          {new Date(web.fetchedAt).toLocaleDateString("ja-JP")}）
        </summary>
        <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed">{web.report}</p>
        {web.sources.length > 0 && (
          <ul className="mt-2 space-y-1">
            {web.sources.map((s) => (
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
  );
}
