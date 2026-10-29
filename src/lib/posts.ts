import { REACTIONS, type ReactionType } from "./constants";
import type { Post } from "./store";

export interface PublicPost {
  id: string;
  nickname: string;
  areaId: string;
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
    comment: p.comment,
    image: p.image,
    createdAt: p.createdAt,
    mine: p.uid === uid,
    reactions: Object.fromEntries(types.map((t) => [t, p.reactions[t]?.length ?? 0])) as Record<ReactionType, number>,
    myReactions: types.filter((t) => p.reactions[t]?.includes(uid)),
    insight: p.insight,
  };
}
