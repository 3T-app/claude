"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, PageHeader } from "@/components/ui";

interface AdminData {
  teachings: string;
  insights: { id: string; area: string; comment: string; reactions: number; indicator: string; summary: string; mechanism: string }[];
  trends: { genre: string; fetchedAt: string; by: string }[];
  stats: { posts: number; lectures: number };
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
      t = sessionStorage.getItem("adminToken") ?? "";
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
                  sessionStorage.setItem("adminToken", token);
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
