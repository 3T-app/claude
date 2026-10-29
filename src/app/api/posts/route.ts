import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { getArea } from "@/lib/areas";
import { readPost } from "@/lib/features";
import { errorResponse, getUid } from "@/lib/http";
import { toPublic } from "@/lib/posts";
import { emptyReactions, readDB, updateDB, UPLOAD_DIR, type Post } from "@/lib/store";

export const maxDuration = 60;

const TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" } as const;
type ImageType = keyof typeof TYPES;
const MAX_BYTES = 5 * 1024 * 1024;

export async function GET(req: Request) {
  const area = new URL(req.url).searchParams.get("area");
  const uid = await getUid();
  const db = await readDB();
  const posts = db.posts
    .filter((p) => !area || p.areaId === area)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 100)
    .map((p) => toPublic(p, uid));
  return NextResponse.json({ posts });
}

export async function POST(req: Request) {
  const form = await req.formData();
  const comment = String(form.get("comment") ?? "").trim().slice(0, 400);
  const areaId = String(form.get("areaId") ?? "");
  const nickname = String(form.get("nickname") ?? "").trim().slice(0, 20) || "まち歩きさん";
  const file = form.get("image");

  if (!comment) return NextResponse.json({ error: "気づいたことを書いてください。" }, { status: 400 });
  if (!getArea(areaId)) return NextResponse.json({ error: "街を選んでください。" }, { status: 400 });
  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "写真を選んでください。" }, { status: 400 });
  }
  if (!(file.type in TYPES)) return NextResponse.json({ error: "JPEG・PNG・WebP・GIFの写真を選んでください。" }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "写真は5MBまでです。" }, { status: 400 });

  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const id = crypto.randomUUID();
    const filename = `${id}.${TYPES[file.type as ImageType]}`;
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    await fs.writeFile(path.join(UPLOAD_DIR, filename), buf);

    // 写真とコメントをAIが読み取り、講義・立地診断で使う「気づき」にする
    const insight = await readPost({
      image: { data: buf.toString("base64"), mediaType: file.type as ImageType },
      comment,
      areaId,
    });

    const uid = await getUid();
    const post: Post = {
      id,
      uid,
      nickname,
      areaId,
      comment,
      image: `/api/uploads/${filename}`,
      createdAt: new Date().toISOString(),
      reactions: emptyReactions(),
      insight,
    };
    await updateDB((db) => {
      db.posts.push(post);
    });
    return NextResponse.json({ post: toPublic(post, uid) });
  } catch (err) {
    return errorResponse(err);
  }
}
