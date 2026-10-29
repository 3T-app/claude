import { NextResponse } from "next/server";
import { diagnose } from "@/lib/features";
import { errorResponse } from "@/lib/http";
import { GENRES } from "@/lib/constants";

export const maxDuration = 300;

export async function POST(req: Request) {
  const { name, address, genre } = (await req.json()) as { name?: string; address?: string; genre?: string };
  if (!name?.trim() || !address?.trim()) {
    return NextResponse.json({ error: "店名と住所を入力してください。" }, { status: 400 });
  }
  const g = GENRES.includes(genre as (typeof GENRES)[number]) ? genre! : "その他";
  try {
    return NextResponse.json(await diagnose({ name: name.trim().slice(0, 60), address: address.trim().slice(0, 120), genre: g }));
  } catch (err) {
    return errorResponse(err);
  }
}
