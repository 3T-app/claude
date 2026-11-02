"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/diagnose", label: "立地調査", icon: "📍" },
  { href: "/learn", label: "商圏を学ぼう", icon: "🗺️", center: true },
  { href: "/board", label: "みんなの投稿", icon: "💬" },
];

export default function BottomNav() {
  const pathname = usePathname();
  if (pathname.startsWith("/admin")) return null;
  return (
    <nav className="fixed inset-x-0 bottom-0 z-[1100] mx-auto max-w-md border-t border-line bg-card/95 backdrop-blur">
      <ul className="grid grid-cols-3 pb-[env(safe-area-inset-bottom)]">
        {TABS.map((t) => {
          const active = pathname.startsWith(t.href);
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                className={`flex flex-col items-center gap-0.5 py-2 text-[11px] font-bold ${
                  active ? "text-accent" : "text-ink-soft"
                }`}
              >
                <span
                  className={`flex items-center justify-center text-xl ${
                    t.center ? `-mt-6 h-14 w-14 rounded-full border-4 border-background shadow ${active ? "bg-accent" : "bg-foreground"}` : "h-7"
                  }`}
                >
                  {t.icon}
                </span>
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
