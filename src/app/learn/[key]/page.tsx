"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import MapView from "@/components/MapView";
import PostCard from "@/components/PostCard";
import { Card, DemoBanner, ErrorNote, Spinner } from "@/components/ui";
import type { Area } from "@/lib/areas";
import type { PublicPost } from "@/lib/posts";
import type { Lecture } from "@/lib/schemas";

interface LectureResponse {
  areaKey: string;
  area: Area | null;
  lecture: Lecture;
  remaining: number;
  demo: boolean;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

const TIME_LABELS: [keyof Lecture["timeShift"], string, string][] = [
  ["morning", "朝", "🌅"],
  ["daytime", "昼", "☀️"],
  ["night", "夜", "🌙"],
  ["weekend", "休日", "🎈"],
];

export default function AreaLecturePage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = use(params);
  const decoded = decodeURIComponent(key);
  const [data, setData] = useState<LectureResponse | null>(null);
  const [error, setError] = useState("");
  const [posts, setPosts] = useState<PublicPost[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/lecture", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: decoded }),
    })
      .then(async (r) => {
        const json = await r.json();
        if (cancelled) return;
        if (!r.ok) setError(json.error ?? "講義を読み込めませんでした。");
        else setData(json);
      })
      .catch(() => !cancelled && setError("通信に失敗しました。"));
    return () => {
      cancelled = true;
    };
  }, [decoded]);

  useEffect(() => {
    if (!data?.area) return;
    fetch(`/api/posts?area=${data.area.id}`)
      .then((r) => r.json())
      .then((j) => setPosts(j.posts ?? []));
  }, [data?.area]);

  return (
    <div>
      <div className="flex items-center gap-2 px-4 pt-5">
        <Link href="/learn" className="text-sm text-ink-soft">
          ← 街を選ぶ
        </Link>
      </div>

      {!data && !error && <Spinner label={`${decoded} の商圏をAIが読み解いています…（30秒ほど）`} />}
      {error && (
        <div className="pt-6">
          <ErrorNote message={error} />
        </div>
      )}

      {data && <LectureView data={data} posts={posts} setPosts={setPosts} />}
    </div>
  );
}

function LectureView({
  data,
  posts,
  setPosts,
}: {
  data: LectureResponse;
  posts: PublicPost[];
  setPosts: (p: PublicPost[]) => void;
}) {
  const { lecture, area } = data;
  return (
    <div className="space-y-4 pb-4">
      <header className="px-4 pt-3">
        <p className="text-[11px] font-bold tracking-widest text-accent">商圏をうんちくに</p>
        <h1 className="mt-1 text-3xl font-black">{lecture.placeName}</h1>
        <p className="mt-2 text-base font-bold leading-snug">{lecture.headline}</p>
      </header>

      {data.demo && <DemoBanner />}

      {area && (
        <div className="overflow-hidden border-y border-line">
          <MapView
            center={[area.lat, area.lng]}
            zoom={15}
            className="h-56 w-full"
            markers={[{ id: area.id, lat: area.lat, lng: area.lng, label: area.name, emphasis: true }]}
            circles={[
              { lat: area.lat, lng: area.lng, radius: 500, color: "#e8532f", label: "半径500m（徒歩約6分）" },
              { lat: area.lat, lng: area.lng, radius: 1000, color: "#3b5bdb", label: "半径1km（徒歩約13分）" },
            ]}
          />
        </div>
      )}

      <div className="space-y-4 px-4">
        <Card>
          <h2 className="text-sm font-black text-accent">商圏の骨格</h2>
          <p className="mt-2 text-sm leading-relaxed">{lecture.overview}</p>
        </Card>

        <div>
          <h2 className="mb-2 text-sm font-black">💬 会話デッキ：そのまま使えるうんちく</h2>
          <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1">
            {lecture.unchiku.map((u, i) => (
              <div key={i} className="w-64 shrink-0 snap-start rounded-2xl bg-foreground p-4 text-white">
                <p className="text-[10px] font-bold text-accent-soft">CARD {i + 1}</p>
                <p className="mt-1 font-bold leading-snug">「{u.line}」</p>
                <p className="mt-2 text-xs leading-relaxed text-white/70">{u.explanation}</p>
              </div>
            ))}
          </div>
        </div>

        <Card>
          <h2 className="text-sm font-black text-accent">街の中のゾーン</h2>
          <ul className="mt-2 space-y-2">
            {lecture.zones.map((z, i) => (
              <li key={i} className="text-sm">
                <span className="font-bold">{z.name}</span>
                <span className="text-ink-soft"> — {z.description}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <h2 className="text-sm font-black text-accent">時間帯で入れ替わる主役（消費サイクル）</h2>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {TIME_LABELS.map(([k, label, icon]) => (
              <div key={k} className="rounded-xl bg-background p-2.5">
                <p className="text-xs font-bold">
                  {icon} {label}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-ink-soft">{lecture.timeShift[k]}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <h2 className="text-sm font-black text-accent">客層とニーズ</h2>
          <p className="mt-2 text-sm leading-relaxed">{lecture.customers}</p>
          <h2 className="mt-4 text-sm font-black text-accent">店と店のつながり（接続性）</h2>
          <p className="mt-2 text-sm leading-relaxed">{lecture.connections}</p>
        </Card>

        <Card>
          <h2 className="text-sm font-black text-accent">🚶 商圏を体感する歩き方</h2>
          <p className="mt-2 text-sm leading-relaxed">{lecture.walkRoute}</p>
        </Card>

        <ChatBox areaKey={data.areaKey} initialRemaining={data.remaining} placeName={lecture.placeName} />

        {area && (
          <div>
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="text-sm font-black">👀 みんなが見つけた{area.name}の商圏</h2>
              <Link href={`/board?area=${area.id}`} className="text-xs font-bold text-accent">
                投稿する →
              </Link>
            </div>
            {lecture.communityNote && (
              <p className="mb-2 rounded-xl bg-accent-soft p-3 text-xs leading-relaxed">{lecture.communityNote}</p>
            )}
            {posts.length === 0 ? (
              <p className="text-xs text-ink-soft">まだ投稿はありません。街歩きの気づきを最初に投稿してみよう。</p>
            ) : (
              <div className="space-y-3">
                {posts.slice(0, 5).map((p) => (
                  <PostCard key={p.id} post={p} onChange={(np) => setPosts(posts.map((x) => (x.id === np.id ? np : x)))} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function ChatBox({ areaKey, initialRemaining, placeName }: { areaKey: string; initialRemaining: number; placeName: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [remaining, setRemaining] = useState(initialRemaining);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [paywall, setPaywall] = useState(false);

  async function send() {
    const question = input.trim();
    if (!question || loading) return;
    if (remaining <= 0) {
      setPaywall(true);
      return;
    }
    setLoading(true);
    setError("");
    const history = messages;
    setMessages([...history, { role: "user", content: question }]);
    setInput("");
    try {
      const r = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ areaKey, question, history }),
      });
      const j = await r.json();
      if (r.status === 402) {
        setRemaining(0);
        setPaywall(true);
        setMessages(history);
        setInput(question);
      } else if (!r.ok) {
        setError(j.error ?? "回答を取得できませんでした。");
        setMessages(history);
        setInput(question);
      } else {
        setMessages([...history, { role: "user", content: question }, { role: "assistant", content: j.answer }]);
        setRemaining(j.remaining);
      }
    } catch {
      setError("通信に失敗しました。");
      setMessages(history);
      setInput(question);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-black">🤖 {placeName}についてAIに質問</h2>
        <span className={`text-xs font-bold ${remaining > 0 ? "text-accent" : "text-ink-soft"}`}>
          {remaining > 0 ? `無料であと${remaining}回` : "無料分は終了"}
        </span>
      </div>

      <div className="mt-3 space-y-2">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <p
              className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm leading-relaxed ${
                m.role === "user" ? "bg-accent text-white" : "bg-background"
              }`}
            >
              {m.content}
            </p>
          </div>
        ))}
        {loading && <p className="text-xs text-ink-soft">AIが考えています…</p>}
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>

      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="例：なぜ東口と西口で客層が違うの？"
          className="min-w-0 flex-1 rounded-xl border border-line bg-background px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <button disabled={loading} className="rounded-xl bg-foreground px-4 text-sm font-bold text-white disabled:opacity-40">
          送信
        </button>
      </form>

      {paywall && (
        <div className="fixed inset-0 z-[2000] flex items-end justify-center bg-black/40" onClick={() => setPaywall(false)}>
          <div className="w-full max-w-md rounded-t-3xl bg-card p-6" onClick={(e) => e.stopPropagation()}>
            <p className="text-lg font-black">続きの質問はプレミアムで</p>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">
              無料の質問は1つの街につき1回までです。プレミアムプランでは、どの街でも質問し放題になります。
            </p>
            <button disabled className="mt-4 w-full rounded-xl bg-accent py-3 font-bold text-white opacity-60">
              プレミアムに登録（準備中）
            </button>
            <button onClick={() => setPaywall(false)} className="mt-2 w-full py-2 text-sm text-ink-soft">
              閉じる
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}
