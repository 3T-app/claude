// 商圏の色塗り用の簡単な幾何計算（数百m規模なので緯度経度を平面として扱う）

export type LatLng = [number, number];

function cross(o: LatLng, a: LatLng, b: LatLng) {
  return (a[1] - o[1]) * (b[0] - o[0]) - (a[0] - o[0]) * (b[1] - o[1]);
}

/** 凸包（Andrew's monotone chain） */
export function convexHull(points: LatLng[]): LatLng[] {
  const pts = [...points].sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  if (pts.length < 3) return pts;
  const lower: LatLng[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: LatLng[] = [];
  for (const p of [...pts].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

/** 点の集まりを、各点のまわりに少し余白をとって包む（店が線状に並んでいても面になる） */
export function zonePolygon(points: LatLng[], paddingM = 35): LatLng[] {
  const dLat = paddingM / 111000;
  const ring: LatLng[] = [];
  for (const [lat, lng] of points) {
    const dLng = paddingM / (111000 * Math.cos((lat * Math.PI) / 180));
    for (let i = 0; i < 8; i++) {
      const t = (i / 8) * 2 * Math.PI;
      ring.push([lat + dLat * Math.sin(t), lng + dLng * Math.cos(t)]);
    }
  }
  return convexHull(ring);
}

export function pointInPolygon([lat, lng]: LatLng, poly: LatLng[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [yi, xi] = poly[i];
    const [yj, xj] = poly[j];
    if (yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function centroid(poly: LatLng[]): LatLng {
  const n = poly.length || 1;
  return [poly.reduce((s, p) => s + p[0], 0) / n, poly.reduce((s, p) => s + p[1], 0) / n];
}
