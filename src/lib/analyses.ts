import { promises as fs } from "fs";
import path from "path";
import { z } from "zod";
import { getArea } from "./areas";
import { lectureValidator, type Lecture, type LectureAI } from "./schemas";
import { DATA_DIR } from "./store";

// Claude Code が Web で調べて書いた街ごとの分析（data/analyses/<id>.json）。
// APIキーがなくても講義として表示でき、キーがあるときは自動分析の土台になる。

export const storedAnalysisValidator = lectureValidator.extend({
  sources: z.array(z.object({ title: z.string(), url: z.string() })),
  analyzedAt: z.string(),
});
export type StoredAnalysis = z.infer<typeof storedAnalysisValidator>;

export async function readAnalysis(areaId: string): Promise<StoredAnalysis | null> {
  if (!/^[a-z0-9-]+$/.test(areaId)) return null;
  try {
    const raw = await fs.readFile(path.join(DATA_DIR, "analyses", `${areaId}.json`), "utf8");
    const parsed = storedAnalysisValidator.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      console.warn(`[analyses] ${areaId}.json の形式が不正です`, parsed.error.issues[0]);
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
}

/** 保存済みの分析を講義の形にする。地図の店データがないので、商圏はおおよその円で描く */
export async function loadAnalysisLecture(areaId: string): Promise<Lecture | null> {
  const a = await readAnalysis(areaId);
  const area = getArea(areaId);
  if (!a || !area) return null;
  const { sources, analyzedAt, ...ai } = a;
  return {
    ...(ai as LectureAI),
    center: { lat: area.lat, lng: area.lng },
    map: {
      zones: ai.zones.map((z) => ({ polygon: null, circle: z.anchor })),
      relations: ai.relations.map(() => ({ points: [] })),
    },
    sources,
    dataUsed: { osm: false, hotpepper: false, estat: false },
    analyzedBy: "claude-code",
    analyzedAt,
  };
}

/** 自動分析に渡す要約（事前の分析として） */
export function formatAnalysis(a: StoredAnalysis): string {
  return [
    `まとめ：${a.conclusion}`,
    `支える人：${a.supporters.map((s) => `${s.who}（${s.need}）`).join("／")}`,
    `商圏の割れ方：${a.zones.map((z) => `${z.name}［${z.area}］${z.character}`).join("／")}`,
    `店と店の関係：${a.relations.map((r) => `[${r.type}] ${r.places.join("→")}：${r.flow}`).join("／")}`,
    `歴史と名残：${a.history.map((h) => `${h.period} ${h.event}（名残：${h.remnant}）`).join("／")}`,
    `新しい勢力：${a.newForces.map((n) => `${n.period} ${n.event}`).join("／")}`,
  ].join("\n");
}
