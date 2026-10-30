"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, PageHeader } from "@/components/ui";
import { AREAS } from "@/lib/areas";
import { ALL_GENRES, GENRES, NOTE_SOURCES } from "@/lib/constants";
import type { TrendNote } from "@/lib/store";

interface AdminData {
  teachings: string;
  insights: { id: string; area: string; comment: string; reactions: number; indicator: string; summary: string; mechanism: string }[];
  trends: { genre: string; fetchedAt: string; by: string }[];
  stats: { posts: number; lectures: number };
  notes: TrendNote[];
  sources: { youtube: boolean; hotpepper: boolean; estat: boolean };
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
            <TrendNotesCard token={token} notes={data.notes} onChange={() => load(token)} />
            <SourcesCard token={token} sources={data.sources} />
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

const SOURCE_NAMES = { youtube: "YouTube", hotpepper: "ホットペッパー", estat: "e-Stat" } as const;

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

function SourcesCard({ token, sources }: { token: string; sources: AdminData["sources"] }) {
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
      <h2 className="text-sm font-black">🔌 AIが自動で使う外部データ</h2>
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
