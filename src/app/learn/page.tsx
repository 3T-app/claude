"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import MapView from "@/components/MapView";
import { Card, PageHeader } from "@/components/ui";
import { AREAS, CATEGORY_LABELS, type AreaCategory } from "@/lib/areas";
import { CATEGORY_COLORS } from "@/lib/categoryColors";

const TOKYO: [number, number] = [35.685, 139.72];

export default function LearnPage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<AreaCategory | "all">("all");

  const areas = useMemo(
    () => AREAS.filter((a) => category === "all" || a.category === category),
    [category],
  );
  const open = (key: string) => router.push(`/learn/${encodeURIComponent(key)}`);

  return (
    <div>
      <PageHeader title="東京のどこを学びたいですか？" sub="街を選ぶと、その街全体の商圏をAIが講義します。" />

      <form
        className="mx-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (query.trim()) open(query.trim());
        }}
      >
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="例：麻布十番、門前仲町、渋谷"
          className="min-w-0 flex-1 rounded-xl border border-line bg-card px-3 py-2.5 text-sm outline-none focus:border-accent"
        />
        <button className="rounded-xl bg-accent px-4 text-sm font-bold text-white">学ぶ</button>
      </form>

      <div className="mt-4 overflow-hidden border-y border-line">
        <MapView
          center={TOKYO}
          zoom={11}
          className="h-72 w-full"
          markers={areas.map((a) => ({
            id: a.id,
            lat: a.lat,
            lng: a.lng,
            label: a.name,
            color: CATEGORY_COLORS[a.category],
          }))}
          onSelect={open}
        />
      </div>

      <div className="flex gap-2 overflow-x-auto px-4 py-3">
        {(["all", ...Object.keys(CATEGORY_LABELS)] as (AreaCategory | "all")[]).map((c) => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={`shrink-0 rounded-full border px-3 py-1 text-xs font-bold ${
              category === c ? "border-foreground bg-foreground text-white" : "border-line bg-card text-ink-soft"
            }`}
          >
            {c === "all" ? `すべて（${AREAS.length}）` : CATEGORY_LABELS[c]}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 px-4">
        {areas.map((a) => (
          <button key={a.id} onClick={() => open(a.id)} className="text-left">
            <Card className="h-full p-3 transition active:scale-[0.98]">
              <span
                className="inline-block rounded-full px-2 py-0.5 text-[10px] font-bold text-white"
                style={{ background: CATEGORY_COLORS[a.category] }}
              >
                {CATEGORY_LABELS[a.category]}
              </span>
              <p className="mt-1.5 text-lg font-black">{a.name}</p>
              <p className="mt-1 text-xs leading-relaxed text-ink-soft">{a.catch}</p>
            </Card>
          </button>
        ))}
      </div>
    </div>
  );
}
