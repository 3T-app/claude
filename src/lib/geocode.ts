import { AREAS } from "./areas";

export interface GeoPoint {
  lat: number;
  lng: number;
  label: string;
  approximate: boolean;
}

// 国土地理院の住所検索API（キー不要）
const GSI_URL = "https://msearch.gsi.go.jp/address-search/AddressSearch?q=";

export async function geocode(address: string): Promise<GeoPoint | null> {
  try {
    const res = await fetch(GSI_URL + encodeURIComponent(address), { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const list = (await res.json()) as { geometry: { coordinates: [number, number] }; properties: { title: string } }[];
      const hit = list[0];
      if (hit) {
        const [lng, lat] = hit.geometry.coordinates;
        return { lat, lng, label: hit.properties.title, approximate: false };
      }
    }
  } catch {
    // ネットワーク不通時は下の簡易判定へ
  }
  // 住所に街の名前が含まれていれば、その街の中心を仮の位置にする
  const area = AREAS.find((a) => address.includes(a.name.split("・")[0]));
  if (area) return { lat: area.lat, lng: area.lng, label: `${area.name}周辺（概算）`, approximate: true };
  return null;
}
