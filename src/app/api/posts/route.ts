import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { AREAS, distanceM, getArea } from "@/lib/areas";
import { PREFECTURES } from "@/lib/constants";
import { readPost } from "@/lib/features";
import { geocode } from "@/lib/geocode";
import { errorResponse, getUid } from "@/lib/http";
import { postPlaceName, postPrefecture, toPublic } from "@/lib/posts";
import { emptyReactions, readDB, updateDB, UPLOAD_DIR, type Post, type PostPlace } from "@/lib/store";

export const maxDuration = 60;

const TYPES = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" } as const;
type ImageType = keyof typeof TYPES;
const MAX_BYTES = 5 * 1024 * 1024;

/** 場所の外れ値を避けるため、東京の48の街の近く（1.5km以内）なら、その街の投稿として扱う */
const SNAP_M = 1500;

// 絞り込み：area=街のid ／ pref=都道府県 ／ scope=outside（東京の48の街以外すべて）
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const area = params.get("area");
  const pref = params.get("pref");
  const outside = params.get("scope") === "outside";
  const uid = await getUid();
  const db = await readDB();
  const posts = db.posts
    .filter((p) => !area || p.areaId === area)
    .filter((p) => !pref || postPrefecture(p) === pref)
    .filter((p) => !outside || !getArea(p.areaId))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 100)
    .map((p) => toPublic(p, uid));
  return NextResponse.json({ posts });
}

export async function POST(req: Request) {
  const form = await req.formData();
  const comment = String(form.get("comment") ?? "").trim().slice(0, 400);
  let areaId = String(form.get("areaId") ?? "");
  const prefecture = String(form.get("prefecture") ?? "");
  const placeName = String(form.get("placeName") ?? "").trim().slice(0, 40);
  const nickname = String(form.get("nickname") ?? "").trim().slice(0, 20) || "まち歩きさん";
  const file = form.get("image");

  if (!comment) return NextResponse.json({ error: "気づいたことを書いてください。" }, { status: 400 });
  // 東京の48の街か、全国どこでも（都道府県＋駅名・地名）
  let place: PostPlace | undefined;
  if (areaId === "other") {
    if (!(PREFECTURES as readonly string[]).includes(prefecture)) return NextResponse.json({ error: "都道府県を選んでください。" }, { status: 400 });
    if (!placeName) return NextResponse.json({ error: "駅名や地名を入れてください。" }, { status: 400 });
    // 住所検索が使えないときの概算（東京の街の名前で推測）は、東京都以外では使わない
    const found = await geocode(`${prefecture}${placeName}`);
    const point = found && (!found.approximate || prefecture === "東京都") ? found : null;
    place = { name: placeName, prefecture, lat: point?.lat ?? null, lng: point?.lng ?? null };
    // 東京の48の街のすぐ近くなら、その街の投稿として講義にも使う
    const near = point && prefecture === "東京都" ? AREAS.find((a) => distanceM(a.lat, a.lng, point.lat, point.lng) < SNAP_M) : undefined;
    areaId = near?.id ?? "";
  } else if (!getArea(areaId)) return NextResponse.json({ error: "街を選んでください。" }, { status: 400 });
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
      placeName: postPlaceName({ areaId, place }),
    });

    const uid = await getUid();
    const post: Post = {
      id,
      uid,
      nickname,
      areaId,
      ...(place ? { place } : {}),
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
