import { getArea } from "./areas";
import { REACTIONS, type ReactionType } from "./constants";
import type { Post, PostPlace } from "./store";

/** 投稿の場所の名前（東京の48の街なら街の名前、それ以外は「都道府県 場所」） */
export function postPlaceName(p: { areaId: string; place?: PostPlace }): string {
  const area = getArea(p.areaId);
  if (area) return area.name;
  if (p.place) return `${p.place.prefecture} ${p.place.name}`;
  return p.areaId || "場所不明";
}

/** 投稿の都道府県（東京の48の街は東京都） */
export function postPrefecture(p: { areaId: string; place?: PostPlace }): string {
  if (getArea(p.areaId)) return "東京都";
  return p.place?.prefecture ?? "不明";
}

export interface PublicPost {
  id: string;
  nickname: string;
  areaId: string;
  place?: PostPlace;
  comment: string;
  image: string | null;
  createdAt: string;
  mine: boolean;
  reactions: Record<ReactionType, number>;
  myReactions: ReactionType[];
  insight: Post["insight"];
}

/** 他人のuidを外に出さない形に変換する */
export function toPublic(p: Post, uid: string): PublicPost {
  const types = Object.keys(REACTIONS) as ReactionType[];
  return {
    id: p.id,
    nickname: p.nickname,
    areaId: p.areaId,
    place: p.place,
    comment: p.comment,
    image: p.image,
    createdAt: p.createdAt,
    mine: p.uid === uid,
    reactions: Object.fromEntries(types.map((t) => [t, p.reactions[t]?.length ?? 0])) as Record<ReactionType, number>,
    myReactions: types.filter((t) => p.reactions[t]?.includes(uid)),
    insight: p.insight,
  };
}
