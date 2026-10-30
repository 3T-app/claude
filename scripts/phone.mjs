// 同じWi-FiのiPhoneから試すための起動スクリプト。実行：npm run phone
// 本番モードでビルドして、ネットワーク上の他の端末から開けるように起動し、iPhoneで開くアドレスを表示する。
import os from "os";
import { spawn } from "child_process";

const PORT = process.env.PORT || "3000";
const ips = Object.values(os.networkInterfaces())
  .flat()
  .filter((i) => i && i.family === "IPv4" && !i.internal)
  .map((i) => i.address);

function showUrls() {
  console.log("\n==============================================");
  if (ips.length === 0) {
    console.log(" ネットワークのアドレスが見つかりません。Wi-Fiにつながっているか確認してください。");
  } else {
    console.log(" iPhoneのSafariで、次のどれかを開いてください：");
    for (const ip of ips) console.log(`   http://${ip}:${PORT}`);
    console.log(" （パソコンとiPhoneを同じWi-Fiにつないでください）");
  }
  console.log(" 止めるときは Ctrl + C");
  console.log("==============================================\n");
}

function run(cmd) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, { stdio: "inherit", shell: true });
    p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} が失敗しました（${code}）`))));
  });
}

console.log("アプリを準備しています（初回は1〜2分かかります）…");
await run("npx next build");
showUrls();
await run(`npx next start -H 0.0.0.0 -p ${PORT}`);
