import { randomUUID } from "crypto";
import { getArea } from "./areas";
import { QUESTION_PRICE_YEN } from "./constants";
import { answerDiagnosisQuestion, answerLectureQuestion, type DiagnosisResult } from "./features";
import { createCheckout, isCheckoutPaid, paymentMode } from "./payments";
import { readDB, updateDB, type StoredQuestion } from "./store";

// AIへの質問は1回ごとに支払う。流れ：
// 1. 質問を「未払い」で保存し、Stripe の支払い画面へ（テスト決済ならその場で「支払い済み」）
// 2. 支払いのあと元の画面に戻り、支払いを Stripe で確かめてから AI が回答する
// 3. 回答に失敗しても支払いは残るので、追加の支払いなしで作り直せる

export type QuestionKind = StoredQuestion["kind"];

/** 画面に返す形（uid と決済のIDは出さない） */
export type PublicQuestion = Omit<StoredQuestion, "uid" | "checkoutSessionId">;

export class QuestionError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export function toPublic(q: StoredQuestion): PublicQuestion {
  const rest: Partial<StoredQuestion> = { ...q };
  delete rest.uid;
  delete rest.checkoutSessionId;
  return rest as PublicQuestion;
}

/** 質問の対象が実在し、その人が見られるものか確かめ、画面に出す名前を返す */
async function resolveTarget(uid: string, kind: QuestionKind, target: string): Promise<string> {
  if (kind === "lecture") return getArea(target)?.name ?? target.slice(0, 40);
  const d = (await readDB()).diagnoses[target];
  if (!d || d.uid !== uid) throw new QuestionError("立地調査の結果が見つかりません。もう一度調査してください。", 404);
  return d.input.name;
}

export async function listQuestions(uid: string, kind: QuestionKind, target: string): Promise<PublicQuestion[]> {
  return Object.values((await readDB()).questions)
    .filter((q) => q.uid === uid && q.kind === kind && q.target === target && q.status !== "unpaid")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map(toPublic);
}

export async function getQuestion(uid: string, id: string): Promise<StoredQuestion> {
  const q = (await readDB()).questions[id];
  if (!q || q.uid !== uid) throw new QuestionError("質問が見つかりません。", 404);
  return q;
}

/** 質問を保存し、Stripe なら支払い画面のURLを返す */
export async function createQuestion(o: {
  uid: string;
  kind: QuestionKind;
  target: string;
  question: string;
  /** 支払いのあとに戻る画面（例：/learn/shibuya、/diagnose?d=…） */
  origin: string;
  returnPath: string;
}): Promise<{ question: PublicQuestion; checkoutUrl: string | null }> {
  const label = await resolveTarget(o.uid, o.kind, o.target);
  const mode = paymentMode();
  const now = new Date().toISOString();
  const q: StoredQuestion = {
    id: randomUUID(),
    uid: o.uid,
    kind: o.kind,
    target: o.target,
    label,
    question: o.question,
    status: mode === "test" ? "paid" : "unpaid",
    payment: mode,
    amount: QUESTION_PRICE_YEN,
    createdAt: now,
    ...(mode === "test" ? { paidAt: now } : {}),
  };

  let checkoutUrl: string | null = null;
  if (mode === "stripe") {
    const back = `${o.origin}${o.returnPath}${o.returnPath.includes("?") ? "&" : "?"}`;
    const session = await createCheckout({
      referenceId: q.id,
      amount: q.amount,
      name: "AIへの質問（1回）",
      description: `${label}について：${q.question}`,
      successUrl: `${back}q=${q.id}`,
      cancelUrl: `${back}canceled=${q.id}`,
    });
    q.checkoutSessionId = session.id;
    checkoutUrl = session.url;
  }

  await updateDB((d) => {
    d.questions[q.id] = q;
    // 支払われずに1日たった質問は消す
    for (const [id, x] of Object.entries(d.questions)) {
      if (x.status === "unpaid" && Date.now() - Date.parse(x.createdAt) > 24 * 60 * 60 * 1000) delete d.questions[id];
    }
  });
  return { question: toPublic(q), checkoutUrl };
}

const answering = new Map<string, Promise<StoredQuestion>>();

/** 支払いを確かめて回答する。回答済みならそのまま返す */
export async function confirmAndAnswer(uid: string, id: string): Promise<StoredQuestion> {
  const q = await getQuestion(uid, id);
  if (q.status === "answered") return q;
  // 同じ質問の回答を二重に作らない（支払い画面から戻ったあとの再読み込みなど）
  const running = answering.get(id);
  if (running) return running;
  const job = answer(q).finally(() => answering.delete(id));
  answering.set(id, job);
  return job;
}

async function answer(q: StoredQuestion): Promise<StoredQuestion> {
  if (q.status === "unpaid") {
    const paid = q.checkoutSessionId ? await isCheckoutPaid(q.checkoutSessionId, q.id, q.amount) : false;
    if (!paid) throw new QuestionError("お支払いが確認できませんでした。", 402);
    q = await updateDB((d) => {
      const x = d.questions[q.id];
      x.status = "paid";
      x.paidAt = new Date().toISOString();
      return { ...x };
    });
  }

  // 同じ対象への前の質問と回答を、会話の流れとして渡す
  const db = await readDB();
  const history = Object.values(db.questions)
    .filter((x) => x.uid === q.uid && x.kind === q.kind && x.target === q.target && x.status === "answered")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .slice(-3)
    .flatMap((x) => [
      { role: "user" as const, content: x.question },
      { role: "assistant" as const, content: x.answer ?? "" },
    ]);

  let text: string;
  if (q.kind === "lecture") {
    text = await answerLectureQuestion(q.target, q.question, history);
  } else {
    const d = db.diagnoses[q.target];
    if (!d) throw new QuestionError("立地調査の結果が見つかりません。", 404);
    text = await answerDiagnosisQuestion({ input: d.input, result: d.result as DiagnosisResult }, q.question, history);
  }

  return updateDB((d) => {
    const x = d.questions[q.id];
    x.status = "answered";
    x.answer = text;
    x.answeredAt = new Date().toISOString();
    return { ...x };
  });
}
