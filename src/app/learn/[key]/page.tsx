"use client";

import Link from "next/link";
import { use, useCallback, useEffect, useRef, useState } from "react";
import MapView, { type MapLine, type MapMarker, type MapZone } from "@/components/MapView";
import AskAI, { ASK_ANCHOR, AskAILink } from "@/components/AskAI";
import PostCard from "@/components/PostCard";
import { Card, DemoBanner, ErrorNote, Spinner } from "@/components/ui";
import type { Area } from "@/lib/areas";
import type { PublicPost } from "@/lib/posts";
import type { AreaNewsItem } from "@/lib/news";
import type { FocusType, Lecture, NightlifeView } from "@/lib/schemas";
import { zoneColor } from "@/lib/zoneColors";

interface LectureResponse {
  areaKey: string;
  area: Area | null;
  lecture: Lecture;
  demo: boolean;
  news: AreaNewsItem[];
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
  const night = useNightlife(data.areaKey);
  const mapRef = useRef<HTMLDivElement>(null);
  const center = lecture.center ?? (area ? { lat: area.lat, lng: area.lng } : null);
  const nightMode = night.mode && !!night.data;

  // 通常は商圏の色分け。飲み屋街を開くと、出口・人の流れ・飲み屋街の分布に切り替える
  const zones: MapZone[] = nightMode
    ? night.data!.districts.map((d, i) => ({
        number: i + 1,
        label: d.name,
        color: zoneColor(i),
        polygon: night.data!.map.districts[i]?.polygon ?? null,
        circle: night.data!.map.districts[i]?.circle ?? d.anchor,
      }))
    : lecture.zones.map((z, i) => ({
        number: i + 1,
        label: z.name,
        color: zoneColor(i),
        polygon: lecture.map.zones[i]?.polygon ?? null,
        circle: lecture.map.zones[i]?.circle ?? z.anchor,
      }));
  const lines: MapLine[] = nightMode
    ? night.data!.exits.flatMap((x, ei) => {
        const at = night.data!.map.exits[ei];
        return night
          .data!.districts.map((d, di) => ({ d, di }))
          .filter(({ d }) => d.fromExits.includes(x.name))
          .map(({ d, di }) => ({
            points: [
              [at.lat, at.lng],
              [night.data!.map.districts[di]?.circle.lat ?? d.anchor.lat, night.data!.map.districts[di]?.circle.lng ?? d.anchor.lng],
            ] as [number, number][],
            label: `${x.name} → ${d.name}：${x.flow}`,
          }));
      })
    : lecture.relations.map((r, i) => ({ points: lecture.map.relations[i]?.points ?? [], label: r.flow }));
  const markers: MapMarker[] = nightMode
    ? night.data!.map.exits.map((e, i) => ({
        id: `exit-${i}`,
        lat: e.lat,
        lng: e.lng,
        label: `🚉 ${e.name}`,
        color: "#1f2328",
        labelAlways: true,
      }))
    : [];

  function openNight() {
    night.open();
    setActive(null);
    mapRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

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
        <div className="mt-3">
          <AskAILink text={`${lecture.placeName}についてAIに質問する`} />
        </div>
      </header>

      {data.demo && <DemoBanner />}

      {center && (
        <div ref={mapRef} className="scroll-mt-2 border-y border-line">
          {night.mode && (
            <div className="flex items-center justify-between gap-2 bg-foreground px-4 py-2 text-white">
              <p className="text-xs font-bold">🍺 飲み屋街マップ：出口 → 人の流れ → 飲み屋街</p>
              <button onClick={() => night.close()} className="shrink-0 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-bold">
                商圏マップに戻す
              </button>
            </div>
          )}
          <MapView
            center={[center.lat, center.lng]}
            zoom={nightMode ? 16 : 15}
            className="h-80 w-full"
            zones={zones}
            lines={lines}
            markers={markers}
            activeZone={active}
          />
          {night.mode && !night.data && (
            <p className="px-4 pt-2 text-xs font-bold text-ink-soft">{night.error || "① 駅の出口を探しています… ② 出口から先の人の流れを読んでいます… ③ 飲み屋街を分析しています…"}</p>
          )}
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
            <p className="px-4 pb-1 text-[10px] text-ink-soft">円は各{nightMode ? "飲み屋街" : "商圏"}のおおよその範囲です</p>
          )}
          {nightMode ? (
            <p className="px-4 pb-2 text-[10px] text-ink-soft">
              🚉 は駅の出口
              {night.data!.map.exits.some((e) => e.approx) && "（位置がおおよそのものを含む）"}。点線は出口から飲み屋街への人の流れ（線をタップすると内容が出ます）
            </p>
          ) : (
            lines.some((l) => l.points.length >= 2) && (
              <p className="px-4 pb-2 text-[10px] text-ink-soft">点線：店と店の補完関係・集積（線をタップすると内容が出ます）</p>
            )
          )}
        </div>
      )}

      <div className="px-4">
        <Deck unchiku={lecture.unchiku} placeName={lecture.placeName} />
      </div>

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
          <a href={`#${ASK_ANCHOR}`} className="block text-xs font-bold text-accent">
            読んで気になったことは、AIに質問できます（1回100円）→
          </a>
        </article>

        {data.news.length > 0 && (
          <Section title="📰 最近の街のニュース">
            <NewsList items={data.news} />
          </Section>
        )}

        <Details lecture={lecture} active={active} setActive={setActive} night={night} onOpenNight={openNight} />

        <Section title="🚶 商圏を体感する歩き方">
          <p className="text-sm leading-relaxed">{lecture.walkRoute}</p>
        </Section>

        <Sources lecture={lecture} />

        <AskAI
          kind="lecture"
          target={data.areaKey}
          label={lecture.placeName}
          returnPath={`/learn/${encodeURIComponent(data.areaKey)}`}
          intro={`講義で気になったこと、デートで話したいこと、${lecture.placeName}の店選びなど、AIがこの街の講義とみんなの投稿をふまえて答えます。`}
          examples={[
            `${lecture.placeName}でデートするなら、どの順で歩くといい？`,
            "この街で今いちばん伸びている商圏はどこ？",
            "講義の中で、会話で一番ウケそうな話は？",
          ]}
        />

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
type Night = ReturnType<typeof useNightlife>;

const ADULT_KEY = "adult-confirmed";

/** 飲み屋街を開く前の年齢の確認 */
function AgeGate({ open, onYes, onNo }: { open: boolean; onYes: () => void; onNo: () => void }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[2000] flex items-end justify-center bg-black/40" onClick={onNo}>
      <div className="w-full max-w-md rounded-t-3xl bg-card p-6" onClick={(e) => e.stopPropagation()}>
        <p className="text-lg font-black">あなたは18歳以上ですか？</p>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          飲み屋街のページには、お酒の店や夜の繁華街（キャバクラ・ホストクラブなど）の情報が含まれます。18歳以上の方だけご覧ください。
        </p>
        <button onClick={onYes} className="mt-4 w-full rounded-xl bg-foreground py-3 font-bold text-white">
          はい（18歳以上です）
        </button>
        <button onClick={onNo} className="mt-2 w-full rounded-xl border border-line py-3 text-sm font-bold">
          いいえ
        </button>
      </div>
    </div>
  );
}

/** 飲み屋街の分析を、開いたときに読み込む（地図の切り替えにも使う） */
function useNightlife(key: string) {
  const [mode, setMode] = useState(false);
  const [data, setData] = useState<NightlifeView | null>(null);
  const [error, setError] = useState("");
  const loading = useRef(false);

  const open = useCallback(() => {
    setMode(true);
    if (data || loading.current) return;
    loading.current = true;
    setError("");
    fetch("/api/nightlife", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key }),
    })
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) setError(j.error ?? "飲み屋街の分析を読み込めませんでした。");
        else setData(j.nightlife);
      })
      .catch(() => setError("通信に失敗しました。"))
      .finally(() => (loading.current = false));
  }, [key, data]);
  const close = useCallback(() => setMode(false), []);
  return { mode, data, error, open, close };
}

/** 会話デッキ：問いかけのカード。タップすると答え（商圏の理由）が出る */
function Deck({ unchiku, placeName }: { unchiku: Lecture["unchiku"]; placeName: string }) {
  const [open, setOpen] = useState<number[]>([]);
  return (
    <div>
      <h2 className="text-sm font-black">💬 会話デッキ：{placeName}の「なんで？」</h2>
      <p className="mb-2 text-[11px] text-ink-soft">タップすると、その理由を商圏で答えます</p>
      <div className="-mx-4 flex snap-x items-start gap-3 overflow-x-auto px-4 pb-1">
        {unchiku.map((u, i) => {
          const shown = open.includes(i);
          return (
            <button
              key={i}
              onClick={() => setOpen(shown ? open.filter((x) => x !== i) : [...open, i])}
              className="flex w-64 shrink-0 snap-start flex-col rounded-2xl bg-foreground p-4 text-left text-white"
            >
              <p className="text-[10px] font-bold text-accent-soft">Q{i + 1}</p>
              <p className="mt-1 font-bold leading-snug">{u.line}</p>
              {shown ? (
                <p className="mt-2 text-xs leading-relaxed text-white/80">
                  <b className="text-accent-soft">A. </b>
                  {u.explanation}
                </p>
              ) : (
                <p className="mt-3 text-[11px] font-bold text-accent-soft">答えを見る →</p>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function DaytimeBody({ daytime }: { daytime: Lecture["daytime"] }) {
  return (
    <div>
      <p className="text-sm font-bold leading-relaxed">{daytime.summary}</p>
      <ol className="mt-3 space-y-3 border-l-2 border-line pl-3">
        {daytime.slots.map((s) => (
          <li key={s.time} className="text-sm leading-relaxed">
            <span className="rounded bg-accent-soft px-1.5 py-0.5 text-[11px] font-black text-accent">{s.time}</span>
            <span className="ml-1.5 font-bold">{s.who}</span>
            <br />
            <span className="text-xs text-ink-soft">場所：{s.where}</span>
            <br />
            {s.scene}
            {s.tip && <span className="mt-0.5 block text-xs text-ink-soft">👉 {s.tip}</span>}
          </li>
        ))}
      </ol>
    </div>
  );
}

function NightBody({ night, onShowMap }: { night: Night; onShowMap: () => void }) {
  const n = night.data;
  if (!n) {
    return (
      <p className="text-xs font-bold text-ink-soft">
        {night.error || "① 駅の出口を探しています… ② 出口から先の人の流れを読んでいます… ③ 飲み屋街を分析しています…"}
      </p>
    );
  }
  return (
    <div className="space-y-4">
      <p className="text-sm font-bold leading-relaxed">{n.summary}</p>
      <button onClick={onShowMap} className="w-full rounded-xl border border-foreground py-2 text-xs font-bold">
        🗺️ 地図で見る（出口・人の流れ・飲み屋街）
      </button>

      <div>
        <p className="text-xs font-black">① 駅の出口（{n.exits.length}か所）</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {n.exits.map((x) => (
            <span key={x.name} className="rounded-full bg-foreground px-2 py-0.5 text-[11px] font-bold text-white">
              🚉 {x.name}
            </span>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs font-black">② 出口から先の人の流れ</p>
        <ul className="mt-1.5 space-y-2">
          {n.exits.map((x) => (
            <li key={x.name} className="text-sm leading-relaxed">
              <b>{x.name}</b>：{x.flow}
              <br />
              <span className="text-xs text-ink-soft">流れをつくる人：{x.who}</span>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <p className="text-xs font-black">③ 飲み屋街の商圏</p>
        <ul className="mt-1.5 space-y-3">
          {n.districts.map((d, i) => (
            <li key={d.name} className="rounded-xl bg-background p-3 text-sm leading-relaxed">
              <p className="flex flex-wrap items-center gap-1.5 font-black">
                <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: zoneColor(i) }} />
                {i + 1}. {d.name}
              </p>
              <p className="mt-1 flex flex-wrap gap-1">
                <span className="rounded bg-foreground px-1.5 py-0.5 text-[10px] font-bold text-white">{d.vibe}</span>
                <span className="rounded bg-card px-1.5 py-0.5 text-[10px] font-bold">予算：{d.budget}</span>
                <span className="rounded bg-card px-1.5 py-0.5 text-[10px] font-bold">🕘 {d.hours}</span>
              </p>
              <p className="mt-1 text-xs text-ink-soft">
                {d.area}／客層：{d.target}
              </p>
              <p className="mt-1">{d.atmosphere}</p>
              <p className="mt-1 text-xs">🍶 {d.howToEnjoy}</p>
              {d.fromExits.length > 0 && <p className="mt-1 text-[11px] text-ink-soft">流れてくる出口：{d.fromExits.join("・")}</p>}
              {d.caution && <p className="mt-1 text-[11px] font-bold text-red-700">⚠️ {d.caution}</p>}
            </li>
          ))}
        </ul>
      </div>

      <p className="rounded-xl bg-accent-soft p-3 text-xs leading-relaxed">
        <b>大人の一晩の回り方：</b>
        {n.hopping}
      </p>
      <p className="text-[10px] leading-relaxed text-ink-soft">
        {n.source === "ai"
          ? `AIが OpenStreetMap の出口${n.dataUsed.osmExits}か所・飲み屋${n.dataUsed.osmBars}軒の位置とWebの情報から分析（${n.generatedAt?.slice(0, 10)}）`
          : "Claude Code が公開情報から作成した分析です。APIキーがあると、地図の店の位置で分析し直します。"}
        {n.map.exits.some((e) => e.approx) && " 出口の位置にはおおよそのものを含みます。"}
        出口の位置：© OpenStreetMap contributors
      </p>
    </div>
  );
}

function Details({
  lecture,
  active,
  setActive,
  night,
  onOpenNight,
}: {
  lecture: Lecture;
  active: number | null;
  setActive: (n: number | null) => void;
  night: Night;
  onOpenNight: () => void;
}) {
  const [adult, setAdult] = useState(false);
  const [askAge, setAskAge] = useState(false);
  const [denied, setDenied] = useState(false);
  const nightRef = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    try {
      setAdult(localStorage.getItem(ADULT_KEY) === "yes");
    } catch {}
  }, []);
  const sections: { key: FocusType | "昼の街" | "飲み屋街"; title: string; body: React.ReactNode; show: boolean }[] = [
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
  sections.push(
    { key: "昼の街", title: "☀️ 昼の街（朝・ランチ・午後・休日）", show: !!lecture.daytime, body: lecture.daytime && <DaytimeBody daytime={lecture.daytime} /> },
    {
      key: "飲み屋街",
      title: "🍺 飲み屋街（出口 → 人の流れ → 飲み屋街）",
      show: true,
      body: <NightBody night={night} onShowMap={onOpenNight} />,
    },
  );
  const ordered = [...sections.filter((x) => x.key === lecture.focus), ...sections.filter((x) => x.key !== lecture.focus)];
  return (
    <div>
      <AgeGate
        open={askAge}
        onYes={() => {
          setAdult(true);
          setAskAge(false);
          setDenied(false);
          try {
            localStorage.setItem(ADULT_KEY, "yes");
          } catch {}
          // 開くと onToggle が呼ばれ、地図が飲み屋街に切り替わる
          if (nightRef.current) nightRef.current.open = true;
        }}
        onNo={() => {
          setAskAge(false);
          setDenied(true);
        }}
      />
      <h2 className="mb-2 text-sm font-black">🔍 もっと詳しく</h2>
      {denied && !adult && (
        <p className="mb-2 rounded-xl bg-background p-2.5 text-xs text-ink-soft">
          飲み屋街は18歳以上の方向けの内容のため、表示していません。
        </p>
      )}
      <div className="space-y-2">
        {ordered
          .filter((x) => x.show)
          .map((x) => (
            <details
              key={x.key}
              ref={x.key === "飲み屋街" ? nightRef : undefined}
              open={x.key === lecture.focus}
              onToggle={(e) => {
                if (x.key !== "飲み屋街") return;
                // 飲み屋街を開くと、上の地図を飲み屋街の分布に切り替える
                if (e.currentTarget.open) onOpenNight();
                else night.close();
              }}
              className={`group rounded-2xl border px-4 py-3 ${x.key === "飲み屋街" ? "border-foreground bg-card" : "border-line bg-card"}`}
            >
              <summary
                className="cursor-pointer list-none text-sm font-black text-accent"
                onClick={(e) => {
                  // 飲み屋街は18歳以上の方だけ。開く前に年齢を確かめる
                  if (x.key === "飲み屋街" && !adult && !e.currentTarget.parentElement?.hasAttribute("open")) {
                    e.preventDefault();
                    setAskAge(true);
                  }
                }}
              >
                <span className="mr-1 inline-block transition group-open:rotate-90">›</span>
                {x.title}
                {x.key === "飲み屋街" && <span className="ml-1.5 rounded bg-foreground px-1.5 py-0.5 text-[10px] text-white">18歳以上</span>}
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
