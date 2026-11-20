import { NextResponse } from "next/server";
import { getUid } from "@/lib/http";
import { toPublic } from "@/lib/posts";
import { REACTIONS, updateDB, type ReactionType } from "@/lib/store";

// 掲示板ではコメント返信はできず、リアクションだけをつけられる
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { type } = (await req.json()) as { type?: string };
  if (!type || !(type in REACTIONS)) return NextResponse.json({ error: "不明なリアクションです。" }, { status: 400 });
  const uid = await getUid();

  const post = await updateDB((db) => {
    const p = db.posts.find((x) => x.id === id);
    if (!p) return null;
    const list = (p.reactions[type as ReactionType] ??= []);
    const i = list.indexOf(uid);
    if (i >= 0) list.splice(i, 1);
    else list.push(uid);
    return p;
  });
  if (!post) return NextResponse.json({ error: "投稿が見つかりません。" }, { status: 404 });
  return NextResponse.json({ post: toPublic(post, uid) });
}
