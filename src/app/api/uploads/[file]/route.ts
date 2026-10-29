import { promises as fs } from "fs";
import path from "path";
import { UPLOAD_DIR } from "@/lib/store";

const MIME: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" };

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params;
  const ext = file.split(".").pop() ?? "";
  if (!/^[\w-]+\.(jpg|png|webp|gif)$/.test(file)) return new Response("Not found", { status: 404 });
  try {
    const buf = await fs.readFile(path.join(UPLOAD_DIR, file));
    return new Response(buf, {
      headers: { "Content-Type": MIME[ext], "Cache-Control": "public, max-age=31536000, immutable" },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
