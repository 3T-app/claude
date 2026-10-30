"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import MapView, { type MapZone } from "@/components/MapView";
import PostCard from "@/components/PostCard";
import { Card, DemoBanner, ErrorNote, Spinner } from "@/components/ui";
import type { Area } from "@/lib/areas";
import type { PublicPost } from "@/lib/posts";
import type { Lecture } from "@/lib/schemas";
import { zoneColor } from "@/lib/zoneColors";

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

      {!data && !error && <Spinner label={`${decoded} の商圏をAIが読み解いています…（初回は統計・地図の店・歴史を調べるため2〜3分かかります）`} />}
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
  const [active, setActive] = useState<number | null>(null);
  const center = lecture.center ?? (area ? { lat: area.lat, lng: area.lng } : null);
  const zones: MapZone[] = lecture.zones.map((z, i) => ({
    number: i + 1,
    label: z.name,
    color: zoneColor(i),
    polygon: lecture.map.zones[i]?.polygon ?? null,
    circle: lecture.map.zones[i]?.circle ?? z.anchor,
  }));
  const lines = lecture.relations.map((r, i) => ({ points: lecture.map.relations[i]?.points ?? [], label: r.flow }));

  return (
    <div className="space-y-4 pb-4">
      <header className="px-4 pt-3">
        <p className="text-[11px] font-bold tracking-widest text-accent">商圏をうんちくに</p>
        <h1 className="mt-1 text-3xl font-black">{lecture.placeName}</h1>
        <p className="mt-2 text-base font-bold leading-snug">{lecture.headline}</p>
      </header>

      {data.demo && <DemoBanner />}

      {center && (
        <div className="border-y border-line">
          <MapView
            center={[center.lat, center.lng]}
            zoom={15}
            className="h-80 w-full"
            zones={zones}
            lines={lines}
            activeZone={active}
          />
          {/* 凡例：番号・色・名前を並べ、タップでその商圏を強調する */}
          <ul className="flex flex-wrap gap-1.5 px-4 py-2">
            {zones.map((z) => (
              <li key={z.number}>
                <button
                  onClick={() => setActive(active === z.number ? null : z.number)}
                  className={`flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-bold ${
                    active === z.number ? "border-foreground bg-card" : "border-line bg-card/60"
                  }`}
                >
                  <span className="h-3 w-3 rounded-sm" style={{ background: z.color }} />
                  {z.number}. {z.label}
                </button>
              </li>
            ))}
          </ul>
          {lines.some((l) => l.points.length >= 2) && (
            <p className="px-4 pb-2 text-[10px] text-ink-soft">点線：店と店の補完関係・集積（線をタップすると内容が出ます）</p>
          )}
        </div>
      )}

      <div className="space-y-4 px-4">
        <Card className="border-foreground">
          <h2 className="text-sm font-black text-accent">まとめ</h2>
          <p className="mt-2 text-[15px] font-bold leading-relaxed">{lecture.conclusion}</p>
        </Card>

        <Section title="① 町を支える人とニーズ">
          <ul className="space-y-2.5">
            {lecture.supporters.map((s, i) => (
              <li key={i} className="text-sm leading-relaxed">
                <b>{s.who}</b>：{s.need}
                <br />
                <span className="text-xs text-ink-soft">根拠：{s.evidence}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="② 商圏の割れ方">
          <ul className="space-y-3">
            {lecture.zones.map((z, i) => (
              <li key={i} className="text-sm leading-relaxed">
                <button className="w-full text-left" onClick={() => setActive(active === i + 1 ? null : i + 1)}>
                  <span className="flex items-center gap-1.5 font-black">
                    <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: zoneColor(i) }} />
                    {i + 1}. {z.name}
                    <span className="rounded bg-background px-1.5 text-[10px] font-bold text-ink-soft">{z.peak}</span>
                  </span>
                  <span className="text-xs text-ink-soft">{z.area}</span>
                  <br />
                  {z.character}
                </button>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="③ 店と店の関係（補完・集積・価格競争）">
          <ul className="space-y-3">
            {lecture.relations.map((r, i) => (
              <li key={i} className="rounded-xl bg-background p-3 text-sm leading-relaxed">
                <span className="rounded bg-foreground px-1.5 py-0.5 text-[10px] font-bold text-white">{r.type}</span>
                <p className="mt-1.5 font-bold">{r.places.join(" → ")}</p>
                <p className="text-xs">{r.flow}</p>
                <p className="mt-1 text-xs text-ink-soft">
                  使う人：{r.who}／効果：{r.effect}
                </p>
              </li>
            ))}
          </ul>
        </Section>

        {lecture.contrasts.length > 0 && (
          <Section title="④ 出口・通りごとの違い">
            <ul className="space-y-2.5">
              {lecture.contrasts.map((c, i) => (
                <li key={i} className="text-sm leading-relaxed">
                  <b>
                    {c.sideA} と {c.sideB}
                  </b>
                  <br />
                  {c.difference}
                </li>
              ))}
            </ul>
          </Section>
        )}

        <Section title="⑤ 町の歴史と、今に残る名残">
          <ol className="space-y-2.5 border-l-2 border-line pl-3">
            {lecture.history.map((h, i) => (
              <li key={i} className="text-sm leading-relaxed">
                <span className="text-xs font-bold text-accent">{h.period}</span>
                <br />
                {h.event}
                <br />
                <span className="text-xs text-ink-soft">名残：{h.remnant}</span>
              </li>
            ))}
          </ol>
        </Section>

        <Section title="⑥ 新しい勢力と今の魅力">
          <ul className="space-y-2.5">
            {lecture.newForces.map((n, i) => (
              <li key={i} className="text-sm leading-relaxed">
                <span className="text-xs font-bold text-accent">{n.period}</span>　{n.event}
                <br />
                <span className="text-xs text-ink-soft">{n.effect}</span>
              </li>
            ))}
          </ul>
        </Section>

        <Section title="⑦ 昼と夜">
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-background p-2.5">
              <p className="text-xs font-bold">☀️ 昼</p>
              <p className="mt-1 text-xs leading-relaxed">{lecture.dayNight.day}</p>
            </div>
            <div className="rounded-xl bg-background p-2.5">
              <p className="text-xs font-bold">🌙 夜</p>
              <p className="mt-1 text-xs leading-relaxed">{lecture.dayNight.night}</p>
            </div>
          </div>
        </Section>

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

        <Section title="🚶 商圏を体感する歩き方">
          <p className="text-sm leading-relaxed">{lecture.walkRoute}</p>
        </Section>

        <Sources lecture={lecture} />

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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <h2 className="mb-2 text-sm font-black text-accent">{title}</h2>
      {children}
    </Card>
  );
}

function Sources({ lecture }: { lecture: Lecture }) {
  const { dataUsed: d, sources } = lecture;
  return (
    <details className="text-[11px] leading-relaxed text-ink-soft">
      <summary className="cursor-pointer font-bold">この講義の出典</summary>
      <ul className="mt-1 space-y-0.5">
        <li>地図：国土地理院</li>
        {d.osm && <li>店・施設の位置：© OpenStreetMap contributors</li>}
        {d.hotpepper && (
          <li>
            <a href="http://webservice.recruit.co.jp/" target="_blank" rel="noreferrer" className="underline">
              Powered by ホットペッパーグルメ Webサービス
            </a>
          </li>
        )}
        {d.estat && <li>統計：政府統計の総合窓口(e-Stat)</li>}
        {sources.map((s) => (
          <li key={s.url}>
            <a href={s.url} target="_blank" rel="noreferrer" className="underline">
              {s.title || s.url}
            </a>
          </li>
        ))}
      </ul>
    </details>
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
