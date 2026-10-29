"use client";

import { useState } from "react";
import { getArea } from "@/lib/areas";
import type { PublicPost } from "@/lib/posts";
import { REACTIONS, type ReactionType } from "@/lib/constants";

function timeAgo(iso: string) {
  const m = Math.floor((Date.now() - Date.parse(iso)) / 60000);
  if (m < 1) return "たった今";
  if (m < 60) return `${m}分前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}時間前`;
  return `${Math.floor(h / 24)}日前`;
}

export default function PostCard({ post, onChange }: { post: PublicPost; onChange: (p: PublicPost) => void }) {
  const [busy, setBusy] = useState(false);
  const area = getArea(post.areaId);

  async function react(type: ReactionType) {
    if (busy) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/posts/${post.id}/react`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      if (r.ok) onChange((await r.json()).post);
    } finally {
      setBusy(false);
    }
  }

  // LINEのオープンチャットのように、自分の投稿は右、みんなの投稿は左に並べる
  return (
    <div className={`flex gap-2 ${post.mine ? "flex-row-reverse" : ""}`}>
      {!post.mine && (
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-foreground text-sm font-bold text-white">
          {post.nickname.slice(0, 1)}
        </div>
      )}
      <div className={`flex max-w-[85%] flex-col ${post.mine ? "items-end" : "items-start"}`}>
        <p className="mb-1 text-[11px] text-ink-soft">
          {post.mine ? "あなた" : post.nickname}・{timeAgo(post.createdAt)}
        </p>
        <div
          className={`overflow-hidden rounded-2xl border ${
            post.mine ? "rounded-tr-sm border-accent/30 bg-accent-soft" : "rounded-tl-sm border-line bg-card"
          }`}
        >
          {post.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={post.image} alt={`${area?.name ?? ""}の街並み`} className="max-h-72 w-full object-cover" />
          ) : (
            <div className="flex h-24 items-center justify-center bg-gradient-to-br from-accent-soft to-line text-xs text-ink-soft">
              📷 サンプル投稿（写真なし）
            </div>
          )}
          <div className="p-3">
            {area && (
              <span className="mb-1 inline-block rounded-full bg-foreground px-2 py-0.5 text-[10px] font-bold text-white">
                📍 {area.name}
              </span>
            )}
            <p className="whitespace-pre-wrap text-sm leading-relaxed">{post.comment}</p>
            {post.insight && (
              <div className="mt-2 rounded-xl bg-background/80 p-2 text-[11px] leading-relaxed">
                <span className="font-bold text-accent">AIの読み取り｜{post.insight.indicator}</span>
                <br />
                {post.insight.mechanism}
              </div>
            )}
          </div>
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {(Object.keys(REACTIONS) as ReactionType[]).map((t) => {
            const on = post.myReactions.includes(t);
            return (
              <button
                key={t}
                onClick={() => react(t)}
                className={`rounded-full border px-2 py-0.5 text-[11px] ${
                  on ? "border-accent bg-accent text-white" : "border-line bg-card text-ink-soft"
                }`}
              >
                {REACTIONS[t]} {post.reactions[t] > 0 && <b>{post.reactions[t]}</b>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
