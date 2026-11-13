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

// 海外の流行の先取り：韓国・台湾・アメリカで、その業態で直近30日に再生の多い動画（その国の言葉で検索）
export const GLOBAL_REGIONS = [
  { code: "KR", name: "韓国", lang: "ko" },
  { code: "TW", name: "台湾", lang: "zh-Hant" },
  { code: "US", name: "アメリカ", lang: "en" },
] as const;

const GLOBAL_QUERIES: Record<string, Record<(typeof GLOBAL_REGIONS)[number]["code"], string>> = {
  "カフェ・喫茶": { KR: "카페 신상", TW: "咖啡廳 新開", US: "viral cafe" },
  "スイーツ・ベーカリー": { KR: "디저트 신상 유행", TW: "甜點 爆紅", US: "viral dessert" },
  "ラーメン・つけ麺": { KR: "라멘 맛집 신상", TW: "拉麵 新開", US: "ramen trend" },
  "居酒屋・バー": { KR: "이자카야 술집 신상", TW: "居酒屋 新開", US: "bar trend" },
  "定食・食堂": { KR: "백반 맛집", TW: "定食 便當 爆紅", US: "comfort food trend" },
  "焼肉・ホルモン": { KR: "고기집 신상 맛집", TW: "燒肉 新開", US: "korean bbq trend" },
  "寿司・和食": { KR: "오마카세 스시", TW: "壽司 新開", US: "sushi trend" },
  "イタリアン・フレンチ": { KR: "파스타 신상 맛집", TW: "義大利麵 爆紅", US: "pasta trend" },
  "アジア・エスニック": { KR: "태국 음식 맛집", TW: "東南亞料理 爆紅", US: "viral street food" },
  "テイクアウト・総菜": { KR: "길거리 음식 유행", TW: "夜市 小吃 爆紅", US: "viral street food" },
  その他: { KR: "음식 유행", TW: "美食 爆紅", US: "viral food" },
};

export interface RegionVideos {
  region: string;
  query: string;
  videos: YouTubeVideo[];
}

async function topVideos(params: Record<string, string>, limit: number): Promise<YouTubeVideo[]> {
  const search = await get("search", { part: "snippet", type: "video", order: "viewCount", publishedAfter: new Date(Date.now() - 30 * DAY).toISOString(), ...params });
  const ids: string[] = (search.items ?? []).map((i: { id: { videoId: string } }) => i.id.videoId).filter(Boolean);
  if (ids.length === 0) return [];
  const videos = await get("videos", { part: "snippet,statistics", id: ids.join(",") });
  return (videos.items ?? [])
    .map((v: { id: string; snippet: { title: string; channelTitle: string; publishedAt: string }; statistics: { viewCount?: string } }) => ({
      title: v.snippet.title,
      channel: v.snippet.channelTitle,
      publishedAt: v.snippet.publishedAt,
      views: Number(v.statistics.viewCount ?? 0),
      url: `https://www.youtube.com/watch?v=${v.id}`,
    }))
    .sort((a: YouTubeVideo, b: YouTubeVideo) => b.views - a.views)
    .slice(0, limit);
}

/** 韓国・台湾・アメリカの、この業態の流行動画。無料枠を使いすぎないよう3日キャッシュ（検索1回100ユニット×3か国） */
export async function youtubeGlobalTrends(genre: string): Promise<RegionVideos[]> {
  if (!youtubeEnabled()) return [];
  const queries = GLOBAL_QUERIES[genre] ?? GLOBAL_QUERIES["その他"];
  return cached(`youtube-global:${genre}`, 3 * DAY, async () => {
    const results = await Promise.all(
      GLOBAL_REGIONS.map(async (r) => ({
        region: r.name,
        query: queries[r.code],
        videos: await topVideos({ q: queries[r.code], regionCode: r.code, relevanceLanguage: r.lang, maxResults: "8" }, 4).catch(() => []),
      })),
    );
    return results.filter((r) => r.videos.length > 0);
  });
}

export function formatYouTubeGlobal(regions: RegionVideos[]): string {
  if (regions.length === 0) return "（海外のYouTubeのデータなし）";
  return regions.map((r) => `【${r.region}（検索：${r.query}）】\n${formatYouTube(r.videos)}`).join("\n");
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
