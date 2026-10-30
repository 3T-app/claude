import Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";

export const MODEL = process.env.CLAUDE_MODEL || "claude-opus-5-5";

// 安全分類器が誤って断った場合は、サーバー側でAnthropic推奨のモデルに自動で振り替える
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

let client: Anthropic | null = null;
function getClient() {
  client ??= new Anthropic();
  return client;
}

/** APIキーが無い環境ではデモ応答で画面を確認できるようにする */
export function isDemoMode(): boolean {
  if (process.env.DEMO_MODE === "1") return true;
  return !process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_AUTH_TOKEN;
}

export class AIError extends Error {}

type Effort = "low" | "medium" | "high";
type Content = string | Anthropic.Beta.BetaContentBlockParam[];

function textOf(msg: Anthropic.Beta.BetaMessage): string {
  if (msg.stop_reason === "refusal") {
    throw new AIError("AIがこの内容への回答を控えました。表現を変えてお試しください。");
  }
  return msg.content
    .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

function wrap(err: unknown): never {
  if (err instanceof AIError) throw err;
  if (err instanceof SyntaxError) throw new AIError("AIの回答を読み取れませんでした。もう一度お試しください。");
  if (err instanceof Anthropic.AuthenticationError) throw new AIError("APIキーが無効です。");
  if (err instanceof Anthropic.RateLimitError) throw new AIError("混み合っています。少し待ってからお試しください。");
  if (err instanceof Anthropic.APIError) throw new AIError(`AIの呼び出しに失敗しました（${err.status ?? "network"}）`);
  throw err;
}

/** JSONスキーマで出力を固定し、zodで検証して返す。長い出力でも切れないようストリーミングで受け取る */
export async function askJSON<T>(opts: {
  system: string;
  content: Content;
  schema: Record<string, unknown>;
  validator: z.ZodType<T>;
  effort?: Effort;
}): Promise<T> {
  try {
    const msg = await getClient()
      .beta.messages.stream({
        model: MODEL,
        max_tokens: 48000,
        betas: [FALLBACK_BETA],
        fallbacks: "default",
        system: opts.system,
        output_config: {
          effort: opts.effort ?? "medium",
          format: { type: "json_schema", schema: opts.schema },
        },
        messages: [{ role: "user", content: opts.content }],
      })
      .finalMessage();
    if (msg.stop_reason === "max_tokens") throw new AIError("回答が長くなりすぎました。もう一度お試しください。");
    const parsed = opts.validator.safeParse(JSON.parse(textOf(msg)));
    if (!parsed.success) throw new AIError("AIの回答を読み取れませんでした。もう一度お試しください。");
    return parsed.data;
  } catch (err) {
    wrap(err);
  }
}

/** 通常の会話（チャット用） */
export async function askText(opts: {
  system: string;
  messages: Anthropic.Beta.BetaMessageParam[];
  effort?: Effort;
}): Promise<string> {
  try {
    const msg = await getClient().beta.messages.create({
      model: MODEL,
      max_tokens: 4000,
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      system: opts.system,
      output_config: { effort: opts.effort ?? "low" },
      messages: opts.messages,
    });
    return textOf(msg);
  } catch (err) {
    wrap(err);
  }
}

/** Web検索つきで調べさせ、本文と参照URLを返す（トレンド巡回用） */
export async function askWithWebSearch(opts: {
  system: string;
  prompt: string;
  maxUses?: number;
}): Promise<{ text: string; sources: { title: string; url: string }[] }> {
  const tools: Anthropic.Beta.BetaToolUnion[] = [
    {
      type: "web_search_20260209",
      name: "web_search",
      max_uses: opts.maxUses ?? 6,
      user_location: { type: "approximate", country: "JP", city: "Tokyo", timezone: "Asia/Tokyo" },
    },
  ];
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: opts.prompt }];
  try {
    let msg: Anthropic.Beta.BetaMessage | null = null;
    const blocks: Anthropic.Beta.BetaContentBlock[] = [];
    // サーバー側ツールのループが上限に達すると pause_turn で返るので、そのまま送り返して続けさせる
    for (let i = 0; i < 4; i++) {
      msg = await getClient().beta.messages.create({
        model: MODEL,
        max_tokens: 16000,
        betas: [FALLBACK_BETA],
        fallbacks: "default",
        system: opts.system,
        output_config: { effort: "medium" },
        tools,
        messages,
      });
      blocks.push(...msg.content);
      if (msg.stop_reason !== "pause_turn") break;
      messages.push({ role: "assistant", content: msg.content });
    }
    if (!msg) throw new AIError("検索に失敗しました。");

    const sources = new Map<string, string>();
    for (const block of blocks) {
      if (block.type === "web_search_tool_result" && Array.isArray(block.content)) {
        for (const r of block.content) {
          if (r.type === "web_search_result" && !sources.has(r.url)) sources.set(r.url, r.title);
        }
      }
    }
    return {
      text: textOf({ ...msg, content: blocks }),
      sources: [...sources].slice(0, 8).map(([url, title]) => ({ url, title })),
    };
  } catch (err) {
    wrap(err);
  }
}
