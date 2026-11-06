import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { AIError } from "./claude";

export async function getUid(): Promise<string> {
  return (await cookies()).get("uid")?.value ?? "anonymous";
}

export function errorResponse(err: unknown) {
  if (err instanceof AIError) return NextResponse.json({ error: err.message }, { status: 502 });
  console.error(err);
  return NextResponse.json({ error: "サーバーでエラーが起きました。" }, { status: 500 });
}
