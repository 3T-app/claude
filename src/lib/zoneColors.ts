// 商圏の色分け。検証済みの8色を決まった順に使い、色だけで区別させないよう番号を併記する。
// 4色目以降は色が近くなるため、地図の番号ラベルと凡例の番号で区別する。
export const ZONE_COLORS = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];

export function zoneColor(i: number) {
  return ZONE_COLORS[i % ZONE_COLORS.length];
}
