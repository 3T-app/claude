import { NextResponse } from "next/server";
import { adminAuthorized } from "@/lib/admin";
import { ALL_GENRES, GENRES, NOTE_SOURCES } from "@/lib/constants";
import { updateDB, type TrendNote } from "@/lib/store";

const DENIED = () => NextResponse.json({ error: "管理トークンが違います。" }, { status: 401 });

// 運営が毎日入れる X・Instagram などの流行メモ
export async function POST(req: Request) {
  if (!adminAuthorized(req)) return DENIED();
  const body = (await req.json()) as Partial<TrendNote>;
  const text = body.text?.trim().slice(0, 600);
  if (!text) return NextResponse.json({ error: "流行の内容を書いてください。" }, { status: 400 });
  const genre = body.genre === ALL_GENRES || GENRES.includes(body.genre as (typeof GENRES)[number]) ? body.genre! : ALL_GENRES;
  const source = NOTE_SOURCES.includes(body.source as (typeof NOTE_SOURCES)[number]) ? body.source! : "その他";
  const url = /^https?:\/\//.test(body.url ?? "") ? body.url!.slice(0, 500) : "";

  const note: TrendNote = { id: crypto.randomUUID(), genre, source, text, url, createdAt: new Date().toISOString() };
  await updateDB((db) => {
    db.trendNotes.push(note);
  });
  return NextResponse.json({ note });
}

export async function DELETE(req: Request) {
  if (!adminAuthorized(req)) return DENIED();
  const id = new URL(req.url).searchParams.get("id");
  const removed = await updateDB((db) => {
    const before = db.trendNotes.length;
    db.trendNotes = db.trendNotes.filter((n) => n.id !== id);
    return before !== db.trendNotes.length;
  });
  if (!removed) return NextResponse.json({ error: "メモが見つかりません。" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
