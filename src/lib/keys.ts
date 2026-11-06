// .env.local に貼ったキーの書き間違いを、直し方が分かる言葉で見つける。
// 見た目が同じ別の文字（ロシア文字の「А」、全角の「Ａ」など）が混ざると、
// 通信のときに「Cannot convert argument to a ByteString」という分かりにくいエラーになるため。

export function keyProblem(envName: string, prefix?: string): string | null {
  const raw = process.env[envName] ?? "";
  if (!raw) return null;
  if (raw !== raw.trim() || /^["']|["']$/.test(raw)) {
    return `${envName} の前後に空白か「"」が入っています。.env.local では ${envName}=キー のように、そのまま貼ってください`;
  }
  const bad = [...raw].findIndex((c) => !/[\x21-\x7e]/.test(c));
  if (bad >= 0) {
    const ch = [...raw][bad];
    return `${envName} の ${bad + 1} 文字目に、英数字に見えて実は別の文字「${ch}」（文字番号 ${ch.codePointAt(0)}）が入っています。キーを手で打たず、発行した画面のコピーボタンでコピーして貼り直してください（Claude のキーは Console で作り直しが必要です）`;
  }
  if (prefix && !raw.startsWith(prefix)) return `${envName} は ${prefix} で始まるはずです。別のキーを貼っていないか確かめてください`;
  return null;
}
