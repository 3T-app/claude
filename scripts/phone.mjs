// 同じWi-FiのiPhoneから試すための起動スクリプト。実行：npm run phone
// 本番モードでビルドして、ネットワーク上の他の端末から開けるように起動し、iPhoneで開くアドレスを表示する。
import net from "net";
import os from "os";
import { spawn } from "child_process";

const WANTED = Number(process.env.PORT || 3000);
const ips = Object.values(os.networkInterfaces())
  .flat()
  .filter((i) => i && i.family === "IPv4" && !i.internal)
  .map((i) => i.address);

function showUrls() {
  console.log("\n==============================================");
  console.log(" 【パソコンで開く】");
  console.log(`   アプリ　：http://localhost:${PORT}`);
  console.log(`   管理画面：http://localhost:${PORT}/admin`);
  if (ips.length === 0) {
    console.log("\n ネットワークのアドレスが見つかりません。iPhoneで開くには、Wi-Fiにつながっているか確認してください。");
  } else {
    console.log("\n 【iPhoneのSafariで開く】（パソコンと同じWi-Fiで。いくつか出たら上から順に試す）");
    for (const ip of ips) {
      console.log(`   アプリ　：http://${ip}:${PORT}`);
      console.log(`   管理画面：http://${ip}:${PORT}/admin`);
    }
  }
  console.log("\n 管理画面の合言葉は .env.local の ADMIN_TOKEN= に書いた文字です");
  console.log(" 止めるときは Ctrl + C");
  console.log("==============================================\n");
}

/** 起動したら、パソコンのブラウザでアプリを開く */
function openBrowser(url) {
  const cmd = process.platform === "win32" ? `start "" "${url}"` : process.platform === "darwin" ? `open "${url}"` : null;
  if (cmd) setTimeout(() => spawn(cmd, { shell: true, stdio: "ignore" }), 4000);
}

/** その番号（ポート）が空いているか */
function isFree(port) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once("error", () => resolve(false));
    srv.once("listening", () => srv.close(() => resolve(true)));
    srv.listen(port, "0.0.0.0");
  });
}

/** 3000番が使われていたら、3001、3002…と空いている番号を探す */
async function freePort(from) {
  for (let p = from; p < from + 20; p++) if (await isFree(p)) return p;
  throw new Error(`${from}〜${from + 19}番がすべて使われています。ほかの黒い画面で動いているアプリを Ctrl + C で止めてください。`);
}

function run(cmd) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, { stdio: "inherit", shell: true });
    p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} が失敗しました（${code}）`))));
  });
}

console.log("アプリを準備しています（初回は1〜2分かかります）…");
await run("npx next build");
const PORT = await freePort(WANTED);
if (PORT !== WANTED) {
  console.log(`\n※ ${WANTED}番は別のアプリが使っていたので、${PORT}番で起動します。`);
  console.log("  （前に開いた黒い画面でアプリが動いたままかもしれません。不要ならその画面で Ctrl + C）");
}
showUrls();
openBrowser(`http://localhost:${PORT}`);
await run(`npx next start -H 0.0.0.0 -p ${PORT}`);
