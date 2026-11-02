"use client";

import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui";
import type { PublicQuestion, QuestionKind } from "@/lib/questions";

// 「AIに質問する」：1回ごとに支払う質問。商圏を学ぼう（街の講義）と立地調査（診断結果）で使う。
// Stripe の支払い画面へ移って戻ってくるので、戻り先のURLの ?q=（支払った質問）と ?canceled=（やめた質問）を読む。

interface Props {
  kind: QuestionKind;
  target: string;
  /** 見出しに出す名前（街の名前・店名） */
  label: string;
  /** 支払いのあとに戻る画面（例：/learn/shibuya、/diagnose?d=…） */
  returnPath: string;
  intro: string;
  examples: string[];
}

export const ASK_ANCHOR = "ask-ai";

export default function AskAI({ kind, target, label, returnPath, intro, examples }: Props) {
  const [items, setItems] = useState<PublicQuestion[]>([]);
  const [price, setPrice] = useState(100);
  const [payment, setPayment] = useState<"stripe" | "test">("stripe");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState(false);
  const handled = useRef(false);

  useEffect(() => {
    fetch(`/api/questions?kind=${kind}&target=${encodeURIComponent(target)}`)
      .then((r) => r.json())
      .then((j) => {
        setItems(j.questions ?? []);
        if (j.price) setPrice(j.price);
        if (j.payment) setPayment(j.payment);
      })
      .catch(() => {});
  }, [kind, target]);

  // 支払い画面から戻ってきたとき
  useEffect(() => {
    if (handled.current) return;
    handled.current = true;
    const params = new URLSearchParams(window.location.search);
    const paid = params.get("q");
    const canceled = params.get("canceled");
    if (!paid && !canceled) return;
    params.delete("q");
    params.delete("canceled");
    const rest = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${rest ? `?${rest}` : ""}#${ASK_ANCHOR}`);
    document.getElementById(ASK_ANCHOR)?.scrollIntoView({ behavior: "smooth" });

    if (canceled) {
      setNote("お支払いをやめました。質問は入力欄に戻してあります。");
      fetch(`/api/questions/${canceled}`)
        .then((r) => r.json())
        .then((j) => j.question && setInput(j.question.question))
        .catch(() => {});
      return;
    }
    void answer(paid!);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function answer(id: string) {
    setBusy("お支払いを確かめて、AIが回答を書いています…");
    setError("");
    try {
      const r = await fetch(`/api/questions/${id}`, { method: "POST" });
      const j = await r.json();
      if (j.question) merge(j.question);
      if (!r.ok) setError(j.error ?? "回答を作れませんでした。");
    } catch {
      setError("通信に失敗しました。");
    } finally {
      setBusy("");
    }
  }

  function merge(q: PublicQuestion) {
    setItems((prev) => [...prev.filter((x) => x.id !== q.id), q].sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
  }

  async function pay() {
    const question = input.trim();
    setConfirming(false);
    setBusy(payment === "stripe" ? "お支払いの画面に移動しています…" : "");
    setError("");
    setNote("");
    try {
      const r = await fetch("/api/questions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind, target, question, returnPath }),
      });
      const j = await r.json();
      if (!r.ok) {
        setError(j.error ?? "質問を送れませんでした。");
        setBusy("");
        return;
      }
      setInput("");
      if (j.checkoutUrl) {
        window.location.href = j.checkoutUrl;
        return;
      }
      merge(j.question);
      await answer(j.question.id);
    } catch {
      setError("通信に失敗しました。");
      setBusy("");
    }
  }

  return (
    <Card className="border-foreground">
      <div id={ASK_ANCHOR} className="scroll-mt-4" />
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-black">🤖 AIに質問する</h2>
        <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-[11px] font-bold text-white">1回 {price}円</span>
      </div>
      <p className="mt-1 text-xs leading-relaxed text-ink-soft">{intro}</p>

      {items.length > 0 && (
        <div className="mt-3 space-y-2">
          {items.map((q) => (
            <div key={q.id} className="space-y-2">
              <div className="flex justify-end">
                <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-accent px-3 py-2 text-sm leading-relaxed text-white">
                  {q.question}
                </p>
              </div>
              <div className="flex justify-start">
                {q.answer ? (
                  <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl bg-background px-3 py-2 text-sm leading-relaxed">{q.answer}</p>
                ) : (
                  <button
                    onClick={() => answer(q.id)}
                    disabled={!!busy}
                    className="rounded-2xl border border-line px-3 py-2 text-xs font-bold text-accent disabled:opacity-40"
                  >
                    回答を作り直す（お支払い済み・追加料金なし）
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {busy && <p className="mt-3 text-xs font-bold text-ink-soft">{busy}</p>}
      {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
      {note && <p className="mt-3 text-xs text-ink-soft">{note}</p>}

      {!input && items.length === 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {examples.map((ex) => (
            <button key={ex} onClick={() => setInput(ex)} className="rounded-full border border-line px-2.5 py-1 text-[11px] text-ink-soft">
              {ex}
            </button>
          ))}
        </div>
      )}

      <form
        className="mt-3 space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (input.trim() && !busy) setConfirming(true);
        }}
      >
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          maxLength={500}
          rows={2}
          placeholder={`${label}について聞きたいことを書いてください`}
          className="w-full resize-none rounded-xl border border-line bg-background px-3 py-2 text-sm outline-none focus:border-accent"
        />
        <button
          disabled={!input.trim() || !!busy}
          className="w-full rounded-xl bg-foreground py-2.5 text-sm font-bold text-white disabled:opacity-40"
        >
          {price}円で質問する
        </button>
      </form>
      {payment === "test" && (
        <p className="mt-2 text-[10px] leading-relaxed text-ink-soft">テスト決済中：決済の設定（STRIPE_SECRET_KEY）がないため、実際には請求されません。</p>
      )}

      {confirming && (
        <div className="fixed inset-0 z-[2000] flex items-end justify-center bg-black/40" onClick={() => setConfirming(false)}>
          <div className="w-full max-w-md rounded-t-3xl bg-card p-6" onClick={(e) => e.stopPropagation()}>
            <p className="text-lg font-black">AIへの質問は1回{price}円です</p>
            <p className="mt-2 line-clamp-4 rounded-xl bg-background p-3 text-sm leading-relaxed">{input.trim()}</p>
            <p className="mt-2 text-xs leading-relaxed text-ink-soft">
              {payment === "stripe"
                ? "カード決済の画面（Stripe）に移動します。お支払いのあと、この画面に戻って回答が表示されます。"
                : "テスト決済です。実際には請求されません。"}
            </p>
            <button onClick={pay} className="mt-4 w-full rounded-xl bg-accent py-3 font-bold text-white">
              {price}円を払って質問する
            </button>
            <button onClick={() => setConfirming(false)} className="mt-2 w-full py-2 text-sm text-ink-soft">
              やめる
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}

/** ページ内の「AIに質問する」へ飛ぶボタン */
export function AskAILink({ text, price = 100 }: { text: string; price?: number }) {
  return (
    <a
      href={`#${ASK_ANCHOR}`}
      className="flex items-center justify-between gap-2 rounded-xl border border-foreground bg-card px-3 py-2.5 text-sm font-bold"
    >
      <span>🤖 {text}</span>
      <span className="shrink-0 text-[11px] text-accent">1回{price}円 →</span>
    </a>
  );
}
