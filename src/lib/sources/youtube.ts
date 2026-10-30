import { cached } from "../store";

// YouTube Data API v3（無料枠：1日10,000ユニット。search は1回100ユニット）
// 業態ごとに「最近の東京の〇〇」で検索し、再生数の多い動画を流行のシグナルとして使う。

const API = "https://www.googleapis.com/youtube/v3";
const DAY = 24 * 60 * 60 * 1000;

const QUERIES: Record<string, string> = {
  "カフェ・喫茶": "東京 カフェ 新店",
  "スイーツ・ベーカリー": "東京 スイーツ 話題",
  "ラーメン・つけ麺": "東京 ラーメン 新店",
  "居酒屋・バー": "東京 居酒屋 せんべろ",
  "定食・食堂": "東京 定食 デカ盛り",
  "焼肉・ホルモン": "東京 焼肉 コスパ",
  "寿司・和食": "東京 寿司 話題",
  "イタリアン・フレンチ": "東京 イタリアン 話題",
  "アジア・エスニック": "東京 韓国グルメ 新大久保",
  "テイクアウト・総菜": "東京 食べ歩き グルメ",
  "その他": "東京 グルメ 話題",
};

export interface YouTubeVideo {
  title: string;
  channel: string;
  publishedAt: string;
  views: number;
  url: string;
}

export function youtubeEnabled() {
  return !!process.env.YOUTUBE_API_KEY;
}

async function get(path: string, params: Record<string, string>) {
  const qs = new URLSearchParams({ ...params, key: process.env.YOUTUBE_API_KEY! });
  const res = await fetch(`${API}/${path}?${qs}`, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(`YouTube API ${res.status}${body?.error?.message ? `：${body.error.message}` : ""}`);
  }
  return res.json();
}

/** ここ30日に公開された動画のうち、再生数の多いもの。24時間キャッシュ */
export async function youtubeTrends(genre: string): Promise<YouTubeVideo[]> {
  if (!youtubeEnabled()) return [];
  const q = QUERIES[genre] ?? QUERIES["その他"];
  return cached(`youtube:${genre}`, DAY, async () => {
    const search = await get("search", {
      part: "snippet",
      q,
      type: "video",
      order: "viewCount",
      regionCode: "JP",
      relevanceLanguage: "ja",
      publishedAfter: new Date(Date.now() - 30 * DAY).toISOString(),
      maxResults: "15",
    });
    const ids: string[] = (search.items ?? []).map((i: { id: { videoId: string } }) => i.id.videoId).filter(Boolean);
    if (ids.length === 0) return [];
    const videos = await get("videos", { part: "snippet,statistics", id: ids.join(",") });
    return (videos.items ?? [])
      .map(
        (v: {
          id: string;
          snippet: { title: string; channelTitle: string; publishedAt: string };
          statistics: { viewCount?: string };
        }) => ({
          title: v.snippet.title,
          channel: v.snippet.channelTitle,
          publishedAt: v.snippet.publishedAt,
          views: Number(v.statistics.viewCount ?? 0),
          url: `https://www.youtube.com/watch?v=${v.id}`,
        }),
      )
      .sort((a: YouTubeVideo, b: YouTubeVideo) => b.views - a.views)
      .slice(0, 10);
  });
}

export function formatYouTube(videos: YouTubeVideo[]): string {
  if (videos.length === 0) return "（YouTubeのデータなし）";
  return videos
    .map((v) => `- ${v.title}（${v.channel}、${Math.round(v.views / 1000)}千回再生、${v.publishedAt.slice(0, 10)}公開）`)
    .join("\n");
}

/** 接続テスト（検索1回＝100ユニット） */
export async function testYouTube(): Promise<string> {
  const r = await get("search", { part: "snippet", q: "東京 グルメ", type: "video", maxResults: "1", regionCode: "JP" });
  return `検索OK：${r.items?.[0]?.snippet?.title ?? "結果0件"}`;
}
