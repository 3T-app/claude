"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import PostCard from "@/components/PostCard";
import { PageHeader, Spinner } from "@/components/ui";
import { AREAS } from "@/lib/areas";
import type { PublicPost } from "@/lib/posts";

export default function BoardPage() {
  return (
    <Suspense fallback={<Spinner label="読み込み中…" />}>
      <Board />
    </Suspense>
  );
}

function Board() {
  const params = useSearchParams();
  const [area, setArea] = useState(params.get("area") ?? "");
  const [posts, setPosts] = useState<PublicPost[] | null>(null);
  const [composing, setComposing] = useState(!!params.get("area"));

  useEffect(() => {
    setPosts(null);
    fetch(`/api/posts${area ? `?area=${area}` : ""}`)
      .then((r) => r.json())
      .then((j) => setPosts(j.posts ?? []));
  }, [area]);

  return (
    <div>
      <PageHeader title="みんなの投稿" sub="街歩きで見つけた「商圏」を写真で共有しよう。投稿にはリアクションだけつけられます。" />

      <div className="sticky top-0 z-10 border-b border-line bg-background/95 px-4 py-2 backdrop-blur">
        <select
          value={area}
          onChange={(e) => setArea(e.target.value)}
          className="w-full rounded-xl border border-line bg-card px-3 py-2 text-sm"
        >
          <option value="">すべての街（全体チャット）</option>
          {AREAS.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-5 px-4 py-4">
        {posts === null && <Spinner label="読み込み中…" />}
        {posts?.length === 0 && <p className="py-10 text-center text-sm text-ink-soft">まだ投稿はありません。</p>}
        {posts?.map((p) => (
          <PostCard key={p.id} post={p} onChange={(np) => setPosts((list) => list!.map((x) => (x.id === np.id ? np : x)))} />
        ))}
      </div>

      <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[900] mx-auto flex max-w-md justify-end px-4">
        <button
          onClick={() => setComposing(true)}
          className="pointer-events-auto rounded-full bg-accent px-5 py-3 font-black text-white shadow-lg"
        >
          ＋ 投稿
        </button>
      </div>

      {composing && (
        <Composer
          defaultArea={area}
          onClose={() => setComposing(false)}
          onPosted={(p) => {
            setPosts((list) => [p, ...(list ?? [])]);
            setComposing(false);
          }}
        />
      )}
    </div>
  );
}

function Composer({
  defaultArea,
  onClose,
  onPosted,
}: {
  defaultArea: string;
  onClose: () => void;
  onPosted: (p: PublicPost) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [areaId, setAreaId] = useState(defaultArea);
  const [comment, setComment] = useState("");
  const [nickname, setNickname] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    try {
      setNickname(localStorage.getItem("nickname") ?? "");
    } catch {
      // ストレージが使えなくても投稿はできる
    }
  }, []);

  useEffect(() => {
    if (!file) return setPreview("");
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !areaId || !comment.trim()) {
      setError("写真・街・気づきをすべて入れてください。");
      return;
    }
    setSending(true);
    setError("");
    try {
      localStorage.setItem("nickname", nickname);
    } catch {}
    const form = new FormData();
    form.set("image", file);
    form.set("areaId", areaId);
    form.set("comment", comment);
    form.set("nickname", nickname);
    try {
      const r = await fetch("/api/posts", { method: "POST", body: form });
      const j = await r.json();
      if (!r.ok) setError(j.error ?? "投稿に失敗しました。");
      else onPosted(j.post);
    } catch {
      setError("通信に失敗しました。");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[2000] flex items-end justify-center bg-black/40" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[90dvh] w-full max-w-md space-y-3 overflow-y-auto rounded-t-3xl bg-card p-5"
      >
        <div className="flex items-center justify-between">
          <p className="text-lg font-black">商圏の気づきを投稿</p>
          <button type="button" onClick={onClose} className="text-sm text-ink-soft">
            閉じる
          </button>
        </div>

        <label className="block cursor-pointer overflow-hidden rounded-2xl border-2 border-dashed border-line">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview} alt="選んだ写真" className="max-h-56 w-full object-cover" />
          ) : (
            <div className="flex h-32 flex-col items-center justify-center text-sm text-ink-soft">
              <span className="text-3xl">📷</span>街並みの写真を選ぶ
            </div>
          )}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            capture="environment"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>

        <select value={areaId} onChange={(e) => setAreaId(e.target.value)} className="w-full rounded-xl border border-line bg-background px-3 py-2.5 text-sm">
          <option value="">どの街？</option>
          {AREAS.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>

        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={4}
          maxLength={400}
          placeholder="例：丼屋を出たカップルが、そのまま2軒隣のジェラート屋に並んでた。がっつり系の後のデザート需要！"
          className="w-full rounded-xl border border-line bg-background px-3 py-2.5 text-sm outline-none focus:border-accent"
        />

        <input
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          maxLength={20}
          placeholder="ニックネーム（任意）"
          className="w-full rounded-xl border border-line bg-background px-3 py-2.5 text-sm"
        />

        <p className="text-[11px] leading-relaxed text-ink-soft">
          投稿された写真とコメントはAIが読み取り、商圏の講義や立地調査の分析に活かされます。人の顔が大きく写った写真は避けてください。
        </p>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button disabled={sending} className="w-full rounded-xl bg-accent py-3 font-black text-white disabled:opacity-50">
          {sending ? "AIが読み取り中…" : "投稿する"}
        </button>
      </form>
    </div>
  );
}
