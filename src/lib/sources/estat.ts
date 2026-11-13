import { cached } from "../store";

// e-Stat API（政府統計の総合窓口。無料・利用登録のみ）
// 既定は「社会・人口統計体系 市区町村データ（人口・世帯）」。
// 統計表IDは ESTAT_STATS_DATA_ID で差し替えられ、項目は名前で探すので表の細かな違いに強くしてある。

const API = "https://api.e-stat.go.jp/rest/3.0/app/json/getStatsData";
const DEFAULT_STATS_DATA_ID = "0000020201";
const DAY = 24 * 60 * 60 * 1000;

// 東京都の区市（町村は試作版では対象外）。コードは全国地方公共団体コードの先頭5桁
const MUNICIPALITIES: Record<string, string> = {
  千代田区: "13101", 中央区: "13102", 港区: "13103", 新宿区: "13104", 文京区: "13105", 台東区: "13106",
  墨田区: "13107", 江東区: "13108", 品川区: "13109", 目黒区: "13110", 大田区: "13111", 世田谷区: "13112",
  渋谷区: "13113", 中野区: "13114", 杉並区: "13115", 豊島区: "13116", 北区: "13117", 荒川区: "13118",
  板橋区: "13119", 練馬区: "13120", 足立区: "13121", 葛飾区: "13122", 江戸川区: "13123",
  八王子市: "13201", 立川市: "13202", 武蔵野市: "13203", 三鷹市: "13204", 青梅市: "13205", 府中市: "13206",
  昭島市: "13207", 調布市: "13208", 町田市: "13209", 小金井市: "13210", 小平市: "13211", 日野市: "13212",
  東村山市: "13213", 国分寺市: "13214", 国立市: "13215", 福生市: "13218", 狛江市: "13219", 東大和市: "13220",
  清瀬市: "13221", 東久留米市: "13222", 武蔵村山市: "13223", 多摩市: "13224", 稲城市: "13225", 羽村市: "13227",
  あきる野市: "13228", 西東京市: "13229",
};

/** 住所などの文字列から区市を探す。「大阪市北区」などを拾わないよう、先頭か「東京都」の直後にあるものだけ */
export function findMunicipality(...texts: (string | undefined)[]): { name: string; code: string } | null {
  const names = Object.keys(MUNICIPALITIES).sort((a, b) => b.length - a.length);
  for (const t of texts) {
    if (!t) continue;
    const body = t.replace(/〒?\d{3}-?\d{4}/, "").trim();
    const name = names.find((n) => new RegExp(`(^|東京都\\s*)${n}`).test(body));
    if (name) return { name, code: MUNICIPALITIES[name] };
  }
  return null;
}

export interface CityStats {
  name: string;
  population: number | null;
  households: number | null;
  singleRatio: number | null;
  elderlyRatio: number | null;
  dayNightRatio: number | null;
  year: string;
}

export function estatEnabled() {
  return !!process.env.ESTAT_APP_ID;
}

type ClassItem = { "@code": string; "@name": string };
type ClassObj = { "@id": string; "@name": string; CLASS: ClassItem | ClassItem[] };
type Value = { "@cat01"?: string; "@area"?: string; "@time"?: string; $: string };

const arr = <T,>(x: T | T[] | undefined): T[] => (x === undefined ? [] : Array.isArray(x) ? x : [x]);

/** 項目名にキーワードを含むもののうち、いちばん名前の短いもの（＝内訳ではない本体） */
function pick(items: ClassItem[], keyword: string): string | null {
  const hits = items.filter((i) => i["@name"].includes(keyword)).sort((a, b) => a["@name"].length - b["@name"].length);
  return hits[0]?.["@code"] ?? null;
}

async function fetchStats(code: string, name: string): Promise<CityStats | null> {
  const qs = new URLSearchParams({
    appId: process.env.ESTAT_APP_ID!,
    statsDataId: process.env.ESTAT_STATS_DATA_ID || DEFAULT_STATS_DATA_ID,
    cdArea: code,
    metaGetFlg: "Y",
  });
  const res = await fetch(`${API}?${qs}`, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`e-Stat API ${res.status}`);
  const json = await res.json();
  const root = json.GET_STATS_DATA;
  if (root?.RESULT?.STATUS !== 0) throw new Error(`e-Stat API: ${root?.RESULT?.ERROR_MSG ?? "unknown"}`);

  const data = root.STATISTICAL_DATA;
  const cat = arr<ClassObj>(data.CLASS_INF?.CLASS_OBJ).find((o) => o["@id"] === "cat01");
  const items = arr(cat?.CLASS);
  const values = arr<Value>(data.DATA_INF?.VALUE);

  // 項目ごとに最新年の値
  let year = "";
  const latest = (keyword: string): number | null => {
    const c = pick(items, keyword);
    if (!c) return null;
    const vs = values.filter((v) => v["@cat01"] === c && !Number.isNaN(Number(v.$)));
    vs.sort((a, b) => (b["@time"] ?? "").localeCompare(a["@time"] ?? ""));
    if (!vs[0]) return null;
    if ((vs[0]["@time"] ?? "") > year) year = vs[0]["@time"] ?? "";
    return Number(vs[0].$);
  };

  const population = latest("総人口");
  const households = latest("一般世帯数");
  const single = latest("単独世帯数");
  const elderly = latest("65歳以上人口");
  const daytime = latest("昼間人口");
  if ([population, households, single, elderly, daytime].every((v) => v === null)) return null;

  const ratio = (a: number | null, b: number | null) => (a !== null && b ? Math.round((a / b) * 1000) / 1000 : null);
  return {
    name,
    population,
    households,
    singleRatio: ratio(single, households),
    elderlyRatio: ratio(elderly, population),
    dayNightRatio: ratio(daytime, population),
    year: year.slice(0, 4),
  };
}

/** 区市の人口・世帯の統計。30日キャッシュ */
export async function cityStats(...texts: (string | undefined)[]): Promise<CityStats | null> {
  if (!estatEnabled()) return null;
  const m = findMunicipality(...texts);
  if (!m) return null;
  return cached(`estat:${m.code}`, 30 * DAY, () => fetchStats(m.code, m.name));
}

const pct = (r: number | null) => (r === null ? "不明" : `${Math.round(r * 1000) / 10}%`);

export function formatCityStats(s: CityStats | null): string {
  if (!s) return "（e-Statのデータなし）";
  return [
    `- ${s.name}（${s.year}年の統計）`,
    `- 人口：${s.population?.toLocaleString("ja-JP") ?? "不明"}人、一般世帯：${s.households?.toLocaleString("ja-JP") ?? "不明"}世帯`,
    `- 一人暮らし（単独世帯）の割合：${pct(s.singleRatio)}`,
    `- 65歳以上の割合：${pct(s.elderlyRatio)}`,
    `- 昼夜間人口比（昼間人口÷夜間人口）：${s.dayNightRatio ?? "不明"}　※1を大きく超えるほど、昼に外から人が集まる街`,
  ].join("\n");
}

/** 接続テスト：豊島区の統計を取り、項目が見つかるか確かめる */
export async function testEstat(): Promise<string> {
  const s = await fetchStats("13116", "豊島区");
  if (!s) return "統計表は取れましたが、人口・世帯の項目が見つかりません。ESTAT_STATS_DATA_ID を見直してください。";
  return `豊島区（${s.year}年）：人口 ${s.population ?? "?"}、単独世帯割合 ${s.singleRatio ?? "?"}、昼夜間人口比 ${s.dayNightRatio ?? "?"}`;
}
