"use client";

import Link from "next/link";
import { use, useEffect, useState } from "react";
import MapView, { type MapZone } from "@/components/MapView";
import PostCard from "@/components/PostCard";
import { Card, DemoBanner, ErrorNote, Spinner } from "@/components/ui";
import type { Area } from "@/lib/areas";
import type { PublicPost } from "@/lib/posts";
import type { AreaNewsItem } from "@/lib/news";
import type { FocusType, Lecture } from "@/lib/schemas";
import { zoneColor } from "@/lib/zoneColors";

interface LectureResponse {
  areaKey: string;
  area: Area | null;
  lecture: Lecture;
  remaining: number;
  demo: boolean;
  news: AreaNewsItem[];
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
        {lecture.angle && (
          <p className="mt-2 border-l-2 border-accent pl-2 text-xs leading-relaxed text-ink-soft">
            <b className="text-accent">この街の読みかた</b>　{lecture.angle}
          </p>
        )}
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
          {zones.every((z) => !z.polygon) && zones.length > 0 && (
            <p className="px-4 pb-1 text-[10px] text-ink-soft">円は各商圏のおおよその範囲です</p>
          )}
          {lines.some((l) => l.points.length >= 2) && (
            <p className="px-4 pb-2 text-[10px] text-ink-soft">点線：店と店の補完関係・集積（線をタップすると内容が出ます）</p>
          )}
        </div>
      )}

      <div className="space-y-4 px-4">
        {lecture.updates.length > 0 && <Updates updates={lecture.updates} />}

        <TodayPickup lecture={lecture} seed={data.areaKey} />

        <article className="space-y-5 rounded-2xl bg-card px-4 py-5">
          {lecture.chapters.map((c, i) => (
            <section key={i}>
              <h2 className="text-[17px] font-black leading-snug">{c.title}</h2>
              <p className="mt-1.5 text-[15px] leading-[1.9]">{c.body}</p>
            </section>
          ))}
          <div className="border-t border-line pt-4">
            <p className="text-xs font-black text-accent">ひとことで言うと</p>
            <p className="mt-1 text-[15px] font-bold leading-relaxed">{lecture.conclusion}</p>
          </div>
        </article>

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

        {data.news.length > 0 && (
          <Section title="📰 最近の街のニュース">
            <NewsList items={data.news} />
          </Section>
        )}

        <Details lecture={lecture} active={active} setActive={setActive} />

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

/** 日本時間で今日が何日目か（ピックアップを毎日入れ替えるため） */
function dayNumber(): number {
  return Math.floor((Date.now() + 9 * 60 * 60 * 1000) / 86_400_000);
}

function seedOf(s: string): number {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

function Updates({ updates }: { updates: Lecture["updates"] }) {
  const [first, ...rest] = updates;
  const item = (u: Lecture["updates"][number]) => (
    <li key={u.date + u.text} className="text-sm leading-relaxed">
      <span className="mr-1 text-[11px] font-bold text-accent">{u.date.slice(5).replace("-", "/")}</span>
      {u.text}
    </li>
  );
  return (
    <Card className="border-accent">
      <h2 className="text-sm font-black text-accent">🆕 この街のアップデート</h2>
      <ul className="mt-1.5 space-y-1.5">{item(first)}</ul>
      {rest.length > 0 && (
        <details className="mt-1.5">
          <summary className="cursor-pointer text-xs font-bold text-ink-soft">これまでの更新（{rest.length}件）</summary>
          <ul className="mt-1.5 space-y-1.5">{rest.map(item)}</ul>
        </details>
      )}
      <p className="mt-2 text-[10px] text-ink-soft">投稿・リアクション・毎朝のニュース巡回から、AIが街の変化を書き足しています</p>
    </Card>
  );
}

/** 講義の中から毎日1つ、別の角度の話を取り出す（同じ日でも街ごとに違うものが出る） */
function TodayPickup({ lecture, seed }: { lecture: Lecture; seed: string }) {
  const pool = [
    ...lecture.history.map((h) => ({ tag: "名残を探す", title: h.remnant, body: `${h.period}：${h.event}` })),
    ...lecture.relations.map((r) => ({ tag: r.type, title: r.places.join(" → "), body: `${r.flow}。${r.effect}` })),
    ...lecture.zones.map((z) => ({ tag: `${z.peak}の商圏`, title: z.name, body: z.character })),
    ...lecture.contrasts.map((c) => ({ tag: "見比べる", title: `${c.sideA} と ${c.sideB}`, body: c.difference })),
    ...lecture.newForces.map((n) => ({ tag: "新しい勢力", title: n.event, body: n.effect })),
    ...lecture.supporters.map((s) => ({ tag: "この街に来る人", title: s.who, body: `${s.need}（${s.evidence}）` })),
  ];
  if (pool.length === 0) return null;
  const pick = pool[(dayNumber() + seedOf(seed)) % pool.length];
  return (
    <Card>
      <p className="text-[11px] font-bold text-ink-soft">
        📅 今日のピックアップ<span className="ml-1.5 rounded bg-background px-1.5 text-[10px]">{pick.tag}</span>
      </p>
      <p className="mt-1 font-black leading-snug">{pick.title}</p>
      <p className="mt-1 text-sm leading-relaxed">{pick.body}</p>
    </Card>
  );
}

/** 項目別の詳しい分析。その街の主役（focus）を先頭に置いて開いておく */
function Details({
  lecture,
  active,
  setActive,
}: {
  lecture: Lecture;
  active: number | null;
  setActive: (n: number | null) => void;
}) {
  const sections: { key: FocusType; title: string; body: React.ReactNode; show: boolean }[] = [
    {
      key: "支える人",
      title: "街を支える人とニーズ",
      show: lecture.supporters.length > 0,
      body: (
        <ul className="space-y-2.5">
          {lecture.supporters.map((s, i) => (
            <li key={i} className="text-sm leading-relaxed">
              <b>{s.who}</b>：{s.need}
              <br />
              <span className="text-xs text-ink-soft">根拠：{s.evidence}</span>
            </li>
          ))}
        </ul>
      ),
    },
    {
      key: "商圏の割れ方",
      title: "地図の色分け（商圏の割れ方）",
      show: lecture.zones.length > 0,
      body: (
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
      ),
    },
    {
      key: "店と店の関係",
      title: "店と店の関係（補完・集積・価格競争）",
      show: lecture.relations.length > 0,
      body: (
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
      ),
    },
    {
      key: "通りの違い",
      title: "出口・通りごとの違い",
      show: lecture.contrasts.length > 0,
      body: (
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
      ),
    },
    {
      key: "歴史と名残",
      title: "街の歴史と、今に残る名残",
      show: lecture.history.length > 0,
      body: (
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
      ),
    },
    {
      key: "新しい勢力",
      title: "新しい勢力と今の魅力",
      show: lecture.newForces.length > 0,
      body: (
        <ul className="space-y-2.5">
          {lecture.newForces.map((n, i) => (
            <li key={i} className="text-sm leading-relaxed">
              <span className="text-xs font-bold text-accent">{n.period}</span>　{n.event}
              <br />
              <span className="text-xs text-ink-soft">{n.effect}</span>
            </li>
          ))}
        </ul>
      ),
    },
    {
      key: "昼と夜",
      title: "昼と夜",
      show: true,
      body: (
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
      ),
    },
  ];
  const ordered = [...sections.filter((x) => x.key === lecture.focus), ...sections.filter((x) => x.key !== lecture.focus)];
  return (
    <div>
      <h2 className="mb-2 text-sm font-black">🔍 もっと詳しく</h2>
      <div className="space-y-2">
        {ordered
          .filter((x) => x.show)
          .map((x) => (
            <details key={x.key} open={x.key === lecture.focus} className="group rounded-2xl border border-line bg-card px-4 py-3">
              <summary className="cursor-pointer list-none text-sm font-black text-accent">
                <span className="mr-1 inline-block transition group-open:rotate-90">›</span>
                {x.title}
                {x.key === lecture.focus && (
                  <span className="ml-1.5 rounded bg-accent px-1.5 py-0.5 text-[10px] text-white">この街の主役</span>
                )}
              </summary>
              <div className="mt-2">{x.body}</div>
            </details>
          ))}
      </div>
    </div>
  );
}

function NewsList({ items }: { items: AreaNewsItem[] }) {
  return (
    <ul className="space-y-2.5">
      {items.map((n) => (
        <li key={n.url + n.title} className="text-sm leading-relaxed">
          <span className="mr-1 rounded bg-foreground px-1.5 py-0.5 text-[10px] font-bold text-white">{n.kind}</span>
          <span className="text-[11px] text-ink-soft">{n.date}</span>
          <br />
          <a href={n.url} target="_blank" rel="noreferrer" className="font-bold underline">
            {n.title}
          </a>
          <span className="text-[11px] text-ink-soft">（{n.source}）</span>
          <br />
          <span className="text-xs">{n.summary}</span>
          <br />
          <span className="text-xs text-ink-soft">商圏への影響：{n.impact}</span>
        </li>
      ))}
    </ul>
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
        {lecture.analyzedBy === "claude-code" && (
          <li>分析：Claude Code が公開情報を調べて作成（{lecture.analyzedAt?.slice(0, 10)}時点）</li>
        )}
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
