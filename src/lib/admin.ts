import { NextResponse } from "next/server";

// /api/admin 以下の共通の認証。ADMIN_TOKEN 未設定なら開発時（npm run dev）のみ通す
export function adminAuthorized(req: Request) {
  const token = process.env.ADMIN_TOKEN?.trim();
  if (!token) return process.env.NODE_ENV !== "production";
  return req.headers.get("x-admin-token")?.trim() === token;
}

/** 開けなかった理由を、直し方が分かる言葉で返す */
export function adminDenied() {
  const error = process.env.ADMIN_TOKEN?.trim()
    ? "管理トークンが違います。.env.local の ADMIN_TOKEN= に書いた文字を、そのまま入れてください。"
    : "管理トークンが設定されていません。.env.local に ADMIN_TOKEN=好きな合言葉（例：ADMIN_TOKEN=shoken2026）を書いて保存し、黒い画面で Ctrl + C で止めてから npm run phone で起動し直してください。";
  return NextResponse.json({ error }, { status: 401 });
}
