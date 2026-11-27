import { NextResponse } from "next/server";
import { z } from "zod";
import { adminAuthorized as authorized, adminDenied } from "@/lib/admin";
import { askJSON, isDemoMode } from "@/lib/claude";
import { errorResponse } from "@/lib/http";
import { baseSystem } from "@/lib/knowledge";
import { outboundReport } from "@/lib/outbound";

export const maxDuration = 120;

/** 外部リンク（お店を探す）の日ごとの回数と、平均からの増減 */
export async function GET(req: Request) {
  if (!authorized(req)) return adminDenied();
  try {
    return NextResponse.json(await outboundReport());
  } catch (err) {
    return errorResponse(err);
  }
}

const str = { type: "string" } as const;
const schema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "findings", "actions"],
  properties: {
    summary: { type: "string", description: "全体の増減と、その読み方を2〜3文で" },
    findings: {
      type: "array",
      description: "増えた・減った飲み屋街ごとの読み。0〜5個",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["target", "change", "reading"],
        properties: { target: str, change: str, reading: { type: "string", description: "考えられる理由（ニュース・曜日・季節・街の商圏）。確かでないことは「〜の可能性」と書く" } },
      },
    },
    actions: { type: "array", items: str, description: "講義や飲み屋街の分析で見直すとよいこと。0〜3個" },
  },
};
const validator = z.object({
  summary: z.string(),
  findings: z.array(z.object({ target: z.string(), change: z.string(), reading: z.string() })),
  actions: z.array(z.string()),
});

/** 増減の理由をAIに読んでもらう（APIキーがあるとき） */
export async function POST(req: Request) {
  if (!authorized(req)) return adminDenied();
  if (isDemoMode()) return NextResponse.json({ error: "APIキーを設定すると、AIが増減の理由を分析します。" }, { status: 400 });
  try {
    const r = await outboundReport();
    const system = await baseSystem("あなたの役割は、飲み屋街のページから Google マップへ移動した回数（＝実際に店を探しに行った人の数）の増減を、商圏の見かたで読み解く分析担当です。");
    const content = [
      `今日：${r.today}`,
      `直近7日の1日平均：${r.avg7} 回／その前の4週間の1日平均：${r.avg28} 回（増減 ${r.changePct ?? "比較なし"}%）`,
      `曜日ごとの1日平均（日〜土）：${r.weekday.join(" / ")}`,
      `日ごとの回数：${r.daily.map((d) => `${d.date.slice(5)}:${d.clicks}`).join(" ")}`,
      `増えた飲み屋街：${r.rising.map((t) => `${t.areaName}「${t.label}」 ${t.last7}回（いつもは${t.base7}回）`).join("／") || "なし"}`,
      `減った飲み屋街：${r.falling.map((t) => `${t.areaName}「${t.label}」 ${t.last7}回（いつもは${t.base7}回）`).join("／") || "なし"}`,
      `よく押された飲み屋街：${r.top.map((t) => `${t.areaName}「${t.label}」${t.last7}回`).join("／") || "なし"}`,
      `増減した街の最近のニュース：${r.newsHints.map((n) => `${n.areaName} ${n.date} [${n.kind}] ${n.title}`).join("／") || "なし"}`,
      "",
      "回数が少ないときは偶然の可能性が高いことをはっきり書く。数字は上のものだけを使う。",
    ].join("\n");
    const analysis = await askJSON({ system, content, schema, validator, effort: "low" });
    return NextResponse.json({ analysis });
  } catch (err) {
    return errorResponse(err);
  }
}
