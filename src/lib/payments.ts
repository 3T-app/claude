// AIへの質問の支払い（Stripe Checkout）。
// STRIPE_SECRET_KEY がなければ「テスト決済」（実際には請求しない）で動く。
// SDK は使わず、Checkout Session の作成と確認だけを REST で呼ぶ。

const STRIPE_API = "https://api.stripe.com/v1";

export type PaymentMode = "stripe" | "test";

export function paymentMode(): PaymentMode {
  return process.env.STRIPE_SECRET_KEY ? "stripe" : "test";
}

async function stripe<T>(path: string, form?: Record<string, string>): Promise<T> {
  const res = await fetch(`${STRIPE_API}/${path}`, {
    method: form ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
    body: form ? new URLSearchParams(form).toString() : undefined,
  });
  const json = (await res.json()) as T & { error?: { message?: string } };
  if (!res.ok) throw new Error(`Stripe: ${json.error?.message ?? res.status}`);
  return json;
}

interface CheckoutSession {
  id: string;
  url: string | null;
  payment_status: "paid" | "unpaid" | "no_payment_required";
  amount_total: number | null;
  currency: string | null;
  client_reference_id: string | null;
}

/** 1回分の支払い画面を作る。円は小数のない通貨なので、amount はそのまま円 */
export async function createCheckout(o: {
  referenceId: string;
  amount: number;
  name: string;
  description: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ id: string; url: string }> {
  const s = await stripe<CheckoutSession>("checkout/sessions", {
    mode: "payment",
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": "jpy",
    "line_items[0][price_data][unit_amount]": String(o.amount),
    "line_items[0][price_data][product_data][name]": o.name,
    "line_items[0][price_data][product_data][description]": o.description.slice(0, 200),
    client_reference_id: o.referenceId,
    "metadata[questionId]": o.referenceId,
    success_url: o.successUrl,
    cancel_url: o.cancelUrl,
    locale: "ja",
  });
  if (!s.url) throw new Error("Stripe: 支払い画面のURLがありません");
  return { id: s.id, url: s.url };
}

/** 支払いが済んでいるか（金額・通貨・質問IDも一致すること） */
export async function isCheckoutPaid(sessionId: string, referenceId: string, amount: number): Promise<boolean> {
  const s = await stripe<CheckoutSession>(`checkout/sessions/${encodeURIComponent(sessionId)}`);
  return (
    s.payment_status === "paid" && s.client_reference_id === referenceId && s.amount_total === amount && s.currency === "jpy"
  );
}

/** /admin の接続テスト：Stripe のキーが使えるかと、テストモードか本番かを確かめる */
export async function testStripe(): Promise<string> {
  const key = process.env.STRIPE_SECRET_KEY ?? "";
  await stripe<{ object: string }>("balance");
  return key.includes("_test_") ? "接続OK（テストモード：実際には請求されません）" : "接続OK（本番モード：実際に請求されます）";
}
