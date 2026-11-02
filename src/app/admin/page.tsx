"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, PageHeader } from "@/components/ui";
import { AREAS } from "@/lib/areas";
import { ALL_GENRES, GENRES, NOTE_SOURCES } from "@/lib/constants";
import type { OutboundReport } from "@/lib/outbound";
import type { PostReport } from "@/lib/postReport";
import type { TrendNote } from "@/lib/store";

interface AdminData {
  teachings: string;
  insights: { id: string; area: string; comment: string; reactions: number; indicator: string; summary: string; mechanism: string }[];
  trends: { genre: string; fetchedAt: string; by: string }[];
  stats: { posts: number; lectures: number };
  notes: TrendNote[];
  envProblem: string | null;
  sources: { claude: boolean; stripe: boolean; youtube: boolean; hotpepper: boolean; estat: boolean };
  model: string;
  demo: boolean;
}

// 運営がAIに「どこを見てほしいか」を教える画面
export default function AdminPage() {
  const [token, setToken] = useState("");
  const [data, setData] = useState<AdminData | null>(null);
  const [draft, setDraft] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async (t: string) => {
    const r = await fetch("/api/admin", { headers: { "x-admin-token": t } });
    const j = await r.json();
    if (!r.ok) return setMessage(j.error);
    setData(j);
    setDraft(j.teachings);
    setMessage("");
  }, []);

  useEffect(() => {
    let t = "";
    try {
      t = localStorage.getItem("adminToken") ?? "";
    } catch {}
    setToken(t);
    load(t);
  }, [load]);

  async function save() {
    const r = await fetch("/api/admin", {
      method: "PUT",
      headers: { "Content-Type": "application/json", "x-admin-token": token },
      body: JSON.stringify({ teachings: draft }),
    });
    setMessage(r.ok ? "保存しました。講義は次に開いたときに新しい教えで作り直されます。" : "保存に失敗しました。");
  }

  return (
    <div className="pb-10">
      <PageHeader title="AIの育成（運営用）" sub="ここに書いた見かたを、AIは講義・チャット・立地調査で最優先に参照します。" />
      <div className="space-y-4 px-4">
        {!data && (
          <Card className="space-y-2">
            <input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="管理トークン（ADMIN_TOKEN）"
              className="w-full rounded-xl border border-line px-3 py-2 text-sm"
            />
            <button
              onClick={() => {
                try {
                  localStorage.setItem("adminToken", token);
                } catch {}
                load(token);
              }}
              className="w-full rounded-xl bg-foreground py-2 text-sm font-bold text-white"
            >
              開く
            </button>
          </Card>
        )}
        {message && <p className="text-sm text-accent">{message}</p>}
        {data && (
          <>
            <p className="text-xs text-ink-soft">
              モデル：{data.model}　{data.demo ? "（デモモード）" : ""}　投稿 {data.stats.posts} 件・作成済み講義 {data.stats.lectures} 件
            </p>
            <OutboundCard token={token} />
            <PostReportCard token={token} />
            <TrendNotesCard token={token} notes={data.notes} onChange={() => load(token)} />
            <SourcesCard token={token} sources={data.sources} envProblem={data.envProblem} />
            <AreaNotesCard token={token} />
            <Card>
              <h2 className="text-sm font-black">運営からの教え</h2>
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={18}
                className="mt-2 w-full rounded-xl border border-line bg-background p-3 font-mono text-xs leading-relaxed"
              />
              <button onClick={save} className="mt-2 w-full rounded-xl bg-accent py-2.5 text-sm font-bold text-white">
                保存する
              </button>
            </Card>
            <Card>
              <h2 className="text-sm font-black">投稿から学んだ気づき（{data.insights.length}件）</h2>
              <ul className="mt-2 divide-y divide-line">
                {data.insights.map((i) => (
                  <li key={i.id} className="py-2 text-xs leading-relaxed">
                    <b>
                      {i.area}｜{i.indicator}｜👍{i.reactions}
                    </b>
                    <br />
                    {i.summary}
                    <br />
                    <span className="text-ink-soft">{i.mechanism}</span>
                  </li>
                ))}
              </ul>
            </Card>
            <Card>
              <h2 className="text-sm font-black">トレンド巡回の記録</h2>
              {data.trends.length === 0 ? (
                <p className="mt-2 text-xs text-ink-soft">まだありません。立地調査を実行するか、Claude Code で /crawl-trends を実行してください。</p>
              ) : (
                <ul className="mt-2 text-xs">
                  {data.trends.map((t) => (
                    <li key={t.genre}>
                      {t.genre}：{new Date(t.fetchedAt).toLocaleString("ja-JP")}（{t.by}）
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

const SOURCE_NAMES = {
  claude: "Claude API（AIの分析・回答）",
  stripe: "Stripe（AIへの質問の決済）",
  youtube: "YouTube",
  hotpepper: "ホットペッパー",
  estat: "e-Stat",
} as const;

/** 毎日の流行メモ。スマホでXやInstagramを見ながら、気になったものを1件ずつ入れる */
function TrendNotesCard({ token, notes, onChange }: { token: string; notes: TrendNote[]; onChange: () => void }) {
  const [genre, setGenre] = useState<string>(ALL_GENRES);
  const [source, setSource] = useState<string>("Instagram");
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const today = new Date().toDateString();
  const todayCount = notes.filter((n) => new Date(n.createdAt).toDateString() === today).length;

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return setError("流行の内容を書いてください。");
    setBusy(true);
    setError("");
    const r = await fetch("/api/admin/notes", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-token": token },
      body: JSON.stringify({ genre, source, text, url }),
    });
    setBusy(false);
    if (!r.ok) return setError((await r.json()).error ?? "保存できませんでした。");
    setText("");
    setUrl("");
    onChange();
  }

  async function remove(id: string) {
    if (!confirm("このメモを削除しますか？")) return;
    await fetch(`/api/admin/notes?id=${id}`, { method: "DELETE", headers: { "x-admin-token": token } });
    onChange();
  }

  const select = "w-full rounded-xl border border-line bg-background px-2 py-2 text-sm";
  return (
    <Card>
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-black">📝 今日の流行メモ（X・Instagram）</h2>
        <span className={`text-xs font-bold ${todayCount ? "text-accent" : "text-ink-soft"}`}>今日 {todayCount} 件</span>
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-ink-soft">
        SNSで見つけた流行を1件ずつ入れてください。直近14日分が、立地調査の「今はやっているもの」とバズるメニュー案で最優先に使われます。
      </p>
      <form onSubmit={add} className="mt-3 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <select value={source} onChange={(e) => setSource(e.target.value)} className={select}>
            {NOTE_SOURCES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <select value={genre} onChange={(e) => setGenre(e.target.value)} className={select}>
            <option>{ALL_GENRES}</option>
            {GENRES.map((g) => (
              <option key={g}>{g}</option>
            ))}
          </select>
        </div>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          maxLength={600}
          placeholder="例：ミニサイズのクロワッサンを箱で買う投稿が急増。断面を見せる写真が多く、20代女性の保存数が多い"
          className="w-full rounded-xl border border-line bg-background px-3 py-2 text-sm"
        />
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          inputMode="url"
          placeholder="参考にした投稿のURL（任意）"
          className="w-full rounded-xl border border-line bg-background px-3 py-2 text-sm"
        />
        {error && <p className="text-xs text-red-600">{error}</p>}
        <button disabled={busy} className="w-full rounded-xl bg-accent py-2.5 text-sm font-bold text-white disabled:opacity-50">
          メモを追加
        </button>
      </form>
      {notes.length > 0 && (
        <ul className="mt-3 divide-y divide-line">
          {notes.map((n) => (
            <li key={n.id} className="flex gap-2 py-2 text-xs leading-relaxed">
              <div className="flex-1">
                <span className="text-[10px] text-ink-soft">
                  {new Date(n.createdAt).toLocaleDateString("ja-JP")}｜{n.source}｜{n.genre}
                </span>
                <br />
                {n.text}
              </div>
              <button onClick={() => remove(n.id)} className="shrink-0 text-[11px] text-ink-soft underline">
                削除
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function SourcesCard({ token, sources, envProblem }: { token: string; sources: AdminData["sources"]; envProblem: string | null }) {
  const [result, setResult] = useState<Record<string, { ok: boolean; message: string }> | null>(null);
  const [busy, setBusy] = useState(false);

  async function check() {
    setBusy(true);
    const r = await fetch("/api/admin/check", { method: "POST", headers: { "x-admin-token": token } });
    setResult(await r.json());
    setBusy(false);
  }

  return (
    <Card>
      <h2 className="text-sm font-black">🔌 接続テスト（Claude API・決済・外部データ）</h2>
      {envProblem && <p className="mt-2 rounded-xl bg-accent-soft p-3 text-xs font-bold leading-relaxed text-red-700">⚠️ {envProblem}</p>}
      <ul className="mt-2 space-y-1.5 text-xs">
        {(Object.keys(SOURCE_NAMES) as (keyof typeof SOURCE_NAMES)[]).map((k) => (
          <li key={k}>
            <b>{SOURCE_NAMES[k]}</b>：{sources[k] ? "キー設定済み" : "未設定"}
            {result?.[k] && (
              <span className={result[k].ok ? "text-green-700" : "text-red-600"}>
                <br />
                {result[k].ok ? "✅ " : "⚠️ "}
                {result[k].message}
              </span>
            )}
          </li>
        ))}
      </ul>
      <button onClick={check} disabled={busy} className="mt-3 w-full rounded-xl bg-foreground py-2 text-sm font-bold text-white disabled:opacity-50">
        {busy ? "確認中…" : "接続テスト"}
      </button>
    </Card>
  );
}

/** 街ごとの現地調査メモ。保存すると、その街の講義は次に開いたときに作り直される */
function AreaNotesCard({ token }: { token: string }) {
  const [area, setArea] = useState("ikebukuro");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    setMessage("");
    fetch(`/api/admin/area-notes?area=${area}`, { headers: { "x-admin-token": token } })
      .then((r) => r.json())
      .then((j) => setNote(j.note ?? ""));
  }, [area, token]);

  async function save() {
    const r = await fetch("/api/admin/area-notes", {
      method: "PUT",
      headers: { "Content-Type": "application/json", "x-admin-token": token },
      body: JSON.stringify({ area, note }),
    });
    setMessage(r.ok ? "保存しました。この街の講義は次に開いたときに作り直されます。" : "保存に失敗しました。");
  }

  return (
    <Card>
      <h2 className="text-sm font-black">🗒️ 街ごとの現地調査メモ</h2>
      <p className="mt-1 text-[11px] leading-relaxed text-ink-soft">
        巡見で分かったこと、町の歴史、補完関係の例などを書いてください。AIは講義と立地調査で、ここを最も信頼できる事実として使います。
      </p>
      <select
        value={area}
        onChange={(e) => setArea(e.target.value)}
        className="mt-2 w-full rounded-xl border border-line bg-background px-2 py-2 text-sm"
      >
        {AREAS.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={12}
        placeholder="例：西口は旧赤線跡の名残でスナックが密集。東口は若手の独立店が多い…"
        className="mt-2 w-full rounded-xl border border-line bg-background p-3 text-xs leading-relaxed"
      />
      {message && <p className="text-xs text-accent">{message}</p>}
      <button onClick={save} className="mt-2 w-full rounded-xl bg-foreground py-2.5 text-sm font-bold text-white">
        保存する
      </button>
    </Card>
  );
}

/** 飲み屋街の「お店を探す」（Google マップへの移動）の日ごとの回数と、平均からの増減 */
function OutboundCard({ token }: { token: string }) {
  const [report, setReport] = useState<OutboundReport | null>(null);
  const [analysis, setAnalysis] = useState<{ summary: string; findings: { target: string; change: string; reading: string }[]; actions: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/outbound", { headers: { "x-admin-token": token } })
      .then((r) => r.json())
      .then((j) => (j.error ? setError(j.error) : setReport(j)))
      .catch(() => setError("読み込めませんでした。"));
  }, [token]);

  async function analyze() {
    setBusy(true);
    setError("");
    const r = await fetch("/api/admin/outbound", { method: "POST", headers: { "x-admin-token": token } });
    const j = await r.json();
    if (r.ok) setAnalysis(j.analysis);
    else setError(j.error ?? "分析できませんでした。");
    setBusy(false);
  }

  const recent = report?.daily.slice(-28) ?? [];
  const max = Math.max(1, ...recent.map((d) => d.clicks));
  return (
    <Card>
      <h2 className="text-sm font-black">🔎 お店を探す（Google マップへの移動）の記録</h2>
      <p className="mt-1 text-[11px] leading-relaxed text-ink-soft">
        飲み屋街の「お店を探す」で、確認のあと Google マップに移動した回数です。回数と、重複を数えるための短い記号だけを残しています。
      </p>
      {error && <p className="mt-2 text-xs text-accent">{error}</p>}
      {report && (
        <div className="mt-2 space-y-3">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-background p-2">
              <p className="text-[10px] text-ink-soft">今日</p>
              <p className="text-lg font-black">{report.todayClicks}</p>
            </div>
            <div className="rounded-xl bg-background p-2">
              <p className="text-[10px] text-ink-soft">直近7日の1日平均</p>
              <p className="text-lg font-black">{report.avg7}</p>
            </div>
            <div className="rounded-xl bg-background p-2">
              <p className="text-[10px] text-ink-soft">その前の4週間</p>
              <p className="text-lg font-black">
                {report.avg28}
                {report.changePct !== null && (
                  <span className={`ml-1 text-[11px] ${report.changePct >= 0 ? "text-accent" : "text-ink-soft"}`}>
                    {report.changePct >= 0 ? "+" : ""}
                    {report.changePct}%
                  </span>
                )}
              </p>
            </div>
          </div>
          <div>
            <p className="text-[11px] font-bold">直近28日</p>
            <div className="mt-1 flex h-16 items-end gap-[2px]">
              {recent.map((d) => (
                <div key={d.date} title={`${d.date}：${d.clicks}回`} className="flex-1 rounded-t bg-foreground/70" style={{ height: `${(d.clicks / max) * 100}%`, minHeight: d.clicks ? 2 : 0 }} />
              ))}
            </div>
          </div>
          <ul className="space-y-1 text-xs leading-relaxed">
            {report.notes.map((n, i) => (
              <li key={i}>・{n}</li>
            ))}
          </ul>
          {report.top.length > 0 && (
            <div>
              <p className="text-[11px] font-bold">直近7日によく押された飲み屋街</p>
              <ul className="mt-1 text-xs">
                {report.top.map((t) => (
                  <li key={t.key}>
                    {t.areaName}「{t.label}」 {t.last7}回
                  </li>
                ))}
              </ul>
            </div>
          )}
          {report.newsHints.length > 0 && (
            <div>
              <p className="text-[11px] font-bold">増減した街の最近のニュース（理由の手がかり）</p>
              <ul className="mt-1 text-xs">
                {report.newsHints.map((n, i) => (
                  <li key={i}>
                    {n.areaName}　{n.date}［{n.kind}］{n.title}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <button onClick={analyze} disabled={busy} className="w-full rounded-xl border border-foreground py-2 text-xs font-bold disabled:opacity-40">
            {busy ? "AIが分析しています…" : "🤖 増減の理由をAIに分析してもらう"}
          </button>
          {analysis && (
            <div className="space-y-2 rounded-xl bg-background p-3 text-xs leading-relaxed">
              <p className="font-bold">{analysis.summary}</p>
              {analysis.findings.map((f, i) => (
                <p key={i}>
                  <b>{f.target}</b>（{f.change}）：{f.reading}
                </p>
              ))}
              {analysis.actions.length > 0 && <p>見直すとよいこと：{analysis.actions.join("／")}</p>}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

/** みんなの投稿を、都道府県ごと・組み合わせごとにまとめる（全国版のための分析） */
function PostReportCard({ token }: { token: string }) {
  const [report, setReport] = useState<PostReport | null>(null);
  const [analysis, setAnalysis] = useState<{ summary: string; regions: { prefecture: string; reading: string }[]; patterns: string[]; nextSteps: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/posts", { headers: { "x-admin-token": token } })
      .then((r) => r.json())
      .then((j) => (j.error ? setError(j.error) : setReport(j)))
      .catch(() => setError("読み込めませんでした。"));
  }, [token]);

  async function analyze() {
    setBusy(true);
    setError("");
    const r = await fetch("/api/admin/posts", { method: "POST", headers: { "x-admin-token": token } });
    const j = await r.json();
    if (r.ok) setAnalysis(j.analysis);
    else setError(j.error ?? "分析できませんでした。");
    setBusy(false);
  }

  return (
    <Card>
      <h2 className="text-sm font-black">🗾 全国のみんなの投稿の分析</h2>
      <p className="mt-1 text-[11px] leading-relaxed text-ink-soft">
        人が「気づいた」店の組み合わせ（＝補完関係が強いところ）を、都道府県ごとに数えています。東京以外の投稿は全国版の材料になります。
      </p>
      {error && <p className="mt-2 text-xs text-accent">{error}</p>}
      {report && (
        <div className="mt-2 space-y-3 text-xs leading-relaxed">
          <ul>
            {report.notes.map((n, i) => (
              <li key={i}>・{n}</li>
            ))}
          </ul>
          <ul className="divide-y divide-line">
            {report.prefectures.map((p) => (
              <li key={p.prefecture} className="py-2">
                <b>
                  {p.prefecture}　{p.posts}件
                </b>
                <span className="text-ink-soft">（直近30日 {p.recent}件・👍{p.reactions}）</span>
                <br />
                <span className="text-ink-soft">{p.places.join("、")}</span>
                {p.pairs.length > 0 && (
                  <>
                    <br />
                    組み合わせ：{p.pairs.map((x) => `${x.pair}（${x.count}）`).join("、")}
                  </>
                )}
                {p.top[0] && (
                  <>
                    <br />
                    よく反応された気づき：{p.top[0].summary}
                  </>
                )}
              </li>
            ))}
          </ul>
          <button onClick={analyze} disabled={busy} className="w-full rounded-xl border border-foreground py-2 text-xs font-bold disabled:opacity-40">
            {busy ? "AIが分析しています…" : "🤖 全国の投稿をAIに分析してもらう"}
          </button>
          {analysis && (
            <div className="space-y-2 rounded-xl bg-background p-3">
              <p className="font-bold">{analysis.summary}</p>
              {analysis.regions.map((r) => (
                <p key={r.prefecture}>
                  <b>{r.prefecture}</b>：{r.reading}
                </p>
              ))}
              {analysis.patterns.length > 0 && <p>地域を問わず効きそうな組み合わせ：{analysis.patterns.join("／")}</p>}
              {analysis.nextSteps.length > 0 && <p>全国版に向けて次にすること：{analysis.nextSteps.join("／")}</p>}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
