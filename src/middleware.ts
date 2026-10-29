import { NextResponse, type NextRequest } from "next/server";

// ログインなしの試作版なので、匿名IDをcookieで配って「自分の投稿」「無料質問の残り」を判定する
export function middleware(req: NextRequest) {
  const res = NextResponse.next();
  if (!req.cookies.get("uid")) {
    res.cookies.set("uid", crypto.randomUUID(), {
      httpOnly: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
    });
  }
  return res;
}

export const config = { matcher: ["/((?!_next/|favicon.ico).*)"] };
