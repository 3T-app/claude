import { NextResponse } from "next/server";
import { adminAuthorized, adminDenied } from "@/lib/admin";
import { getArea } from "@/lib/areas";
import { getAreaNote } from "@/lib/knowledge";
import { updateDB } from "@/lib/store";

const DENIED = adminDenied;

// 街ごとの運営の現地調査メモ。講義と立地調査で最も信頼できる事実として使われる
export async function GET(req: Request) {
  if (!adminAuthorized(req)) return DENIED();
  const id = new URL(req.url).searchParams.get("area") ?? "";
  if (!getArea(id)) return NextResponse.json({ error: "街が見つかりません。" }, { status: 404 });
  return NextResponse.json({ note: await getAreaNote(id) });
}

export async function PUT(req: Request) {
  if (!adminAuthorized(req)) return DENIED();
  const { area, note } = (await req.json()) as { area?: string; note?: string };
  if (!area || !getArea(area) || typeof note !== "string") {
    return NextResponse.json({ error: "街とメモを指定してください。" }, { status: 400 });
  }
  await updateDB((db) => {
    db.areaNotes[area] = note.slice(0, 40000);
  });
  return NextResponse.json({ ok: true });
}
