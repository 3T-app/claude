export function PageHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <header className="px-4 pt-6 pb-3">
      <p className="text-[11px] font-bold tracking-widest text-accent">商圏をうんちくに</p>
      <h1 className="mt-1 text-2xl font-black">{title}</h1>
      {sub && <p className="mt-1 text-sm text-ink-soft">{sub}</p>}
    </header>
  );
}

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-line bg-card p-4 ${className}`}>{children}</section>;
}

export function DemoBanner() {
  return (
    <p className="mx-4 mb-3 rounded-xl bg-amber-100 px-3 py-2 text-xs text-amber-900">
      デモ表示中：ANTHROPIC_API_KEY を設定すると AI による本番の分析になります。
    </p>
  );
}

export function Spinner({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-sm text-ink-soft">
      <span className="h-8 w-8 animate-spin rounded-full border-4 border-accent-soft border-t-accent" />
      {label}
    </div>
  );
}

export function ErrorNote({ message }: { message: string }) {
  return <p className="mx-4 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{message}</p>;
}
