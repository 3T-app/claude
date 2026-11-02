import { NextResponse } from "next/server";
import { getArea } from "@/lib/areas";
import { errorResponse, getUid } from "@/lib/http";
import { OUTBOUND_KINDS, recordOutbound, type OutboundKind } from "@/lib/outbound";

/** 外部リンクを押したことを記録する（回数だけ。行き先のページは記録しない） */
export async function POST(req: Request) {
  const { kind, areaId, label } = (await req.json().catch(() => ({}))) as { kind?: string; areaId?: string; label?: string };
  if (!kind || !OUTBOUND_KINDS.includes(kind as OutboundKind) || !areaId || !getArea(areaId) || !label?.trim()) {
    return NextResponse.json({ error: "記録できませんでした。" }, { status: 400 });
  }
  try {
    await recordOutbound({ uid: await getUid(), kind: kind as OutboundKind, areaId, label: label.trim() });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
