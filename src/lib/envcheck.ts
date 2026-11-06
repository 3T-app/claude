import { existsSync, readdirSync } from "fs";
import path from "path";

/** .env.local が読めていないときの理由を探す（管理画面の接続テスト用） */
export function envFileProblem(): string | null {
  const keys = ["ANTHROPIC_API_KEY", "YOUTUBE_API_KEY", "HOTPEPPER_API_KEY", "ESTAT_APP_ID", "STRIPE_SECRET_KEY"];
  if (keys.some((k) => process.env[k])) return null;
  const dir = process.cwd();
  if (existsSync(path.join(dir, ".env.local"))) {
    return "キーのファイル（.env.local）はありますが、キーが1つも読めていません。メモ帳で開いて、ANTHROPIC_API_KEY=sk-ant-… のように「=」の後ろにキーがあるか、行の先頭に「#」が付いていないかを確かめてください。ファイルを直したら、黒い画面で Ctrl + C を押して止め、起動し直してください。";
  }
  const similar = readdirSync(dir).filter((f) => /^\.?env/i.test(f) && f !== ".env.example");
  if (similar.length) {
    return `キーのファイル（.env.local）が見つかりません。似た名前のファイル「${similar.join("」「")}」があります。名前を「.env.local」に直してください（メモ帳で保存すると「.txt」が付くことがあります）。直したら、アプリを起動し直してください。`;
  }
  return `キーのファイル（.env.local）が、このフォルダにありません：${dir}　前のフォルダの .env.local を、package.json と同じ場所にコピーして、アプリを起動し直してください。`;
}
