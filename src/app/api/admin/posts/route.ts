import { NextResponse } from "next/server";
import { z } from "zod";
import { adminAuthorized as authorized, adminDenied } from "@/lib/admin";
import { askJSON, isDemoMode } from "@/lib/claude";
import { errorResponse } from "@/lib/http";
import { baseSystem } from "@/lib/knowledge";
import { postReport } from "@/lib/postReport";

export const maxDuration = 120;

/** みんなの投稿の、都道府県ごと・組み合わせごとのまとめ */
export async function GET(req: Request) {
  if (!authorized(req)) return adminDenied();
  try {
    return NextResponse.json(await postReport());
  } catch (err) {
    return errorResponse(err);
  }
}

const str = { type: "string" } as const;
const schema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "regions", "patterns", "nextSteps"],
  properties: {
    summary: { type: "string", description: "全国の投稿から分かることを2〜3文で" },
    regions: {
      type: "array",
      description: "東京以外の都道府県ごとの読み。投稿のある地域だけ、0〜6個",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["prefecture", "reading"],
        properties: { prefecture: str, reading: { type: "string", description: "その地域で人が有効だと感じている商圏（どの組み合わせ・どの関係）と、東京との違い" } },
      },
    },
    patterns: { type: "array", items: str, description: "地域を問わず効きそうな補完関係（店の種類の組み合わせ）。0〜5個" },
    nextSteps: { type: "array", items: str, description: "全国版に向けて、次に集めるとよい投稿・調べるとよい街。0〜3個" },
  },
};
const validator = z.object({
  summary: z.string(),
  regions: z.array(z.object({ prefecture: z.string(), reading: z.string() })),
  patterns: z.array(z.string()),
  nextSteps: z.array(z.string()),
});

/** 全国の投稿をAIに読んでもらう（APIキーがあるとき） */
export async function POST(req: Request) {
  if (!authorized(req)) return adminDenied();
  if (isDemoMode()) return NextResponse.json({ error: "APIキーを設定すると、AIが全国の投稿を分析します。" }, { status: 400 });
  try {
    const r = await postReport();
    const system = await baseSystem(
      "あなたの役割は、全国のみんなの投稿から、人が有効だと感じている商圏（気づかれた店の組み合わせ＝補完関係が強いところ）を読み取り、全国版の分析の手がかりにする担当です。",
    );
    const content = [
      ...r.notes,
      "",
      ...r.prefectures.map(
        (p) =>
          `【${p.prefecture}】投稿${p.posts}件（直近30日${p.recent}件）・場所：${p.places.join("、")}\n関係：${Object.entries(p.relations)
            .filter(([, n]) => n > 0)
            .map(([k, n]) => `${k}${n}`)
            .join("／")}\n組み合わせ：${p.pairs.map((x) => `${x.pair}(${x.count})`).join("／") || "なし"}\nよく反応された気づき：${p.top.map((t) => `[${t.place}｜${t.relation}｜👍${t.reactions}] ${t.summary}（${t.mechanism}）`).join("／")}`,
      ),
      "",
      `全国で多い組み合わせ：${r.pairs.map((x) => `${x.pair}（${x.prefectures.join("・")}、${x.count}件）`).join("／") || "なし"}`,
      "",
      "投稿の少ない地域は、偶然の可能性が高いことをはっきり書く。上にない事実は作らない。",
    ].join("\n");
    const analysis = await askJSON({ system, content, schema, validator, effort: "low" });
    return NextResponse.json({ analysis });
  } catch (err) {
    return errorResponse(err);
  }
}
