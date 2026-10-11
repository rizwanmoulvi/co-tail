"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Suspense, type ReactNode } from "react"
import { WalletButton } from "@/components/wallet-button"

const NAV = [
  { href: "/app", label: "Filings" },
  { href: "/app/people", label: "People" },
  { href: "/app/receipts", label: "Receipts" },
  { href: "/app/portfolio", label: "Portfolio" },
  { href: "/app/agent", label: "Agent" },
]

export function AppShell({ children, session }: { children: ReactNode; session: { open: boolean; label: string } | null }) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[1240px] flex-col px-5 pb-16 sm:px-8">
      <Suspense fallback={<div className="h-[72px]" />}>
        <Header session={session} />
      </Suspense>
      <main className="flex-1 pt-8 sm:pt-10">{children}</main>
      <footer className="mt-16 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-line py-6 text-sm text-ink-faint">
        <span>Trades come from House Periodic Transaction Reports and SEC Form 4.</span>
        <span>Tokenized stocks are not offered to US persons. Not investment advice.</span>
      </footer>
    </div>
  )
}

function Header({ session }: { session: { open: boolean; label: string } | null }) {
  const pathname = usePathname()
  const section = pathname.startsWith("/app/p/") ? "/app/people" : (NAV.find((n) => n.href !== "/app" && pathname.startsWith(n.href))?.href ?? "/app")

  return (
    <header className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-3 border-b border-line py-4 md:grid-cols-[1fr_auto_1fr]">
      <Link href="/" className="justify-self-start font-heading text-[1.5rem] font-semibold tracking-[0.2px] text-ink no-underline">
        Tailcoat
      </Link>

      <nav aria-label="Sections" className="order-3 col-span-2 flex max-w-full gap-1 overflow-x-auto rounded-full bg-paper-3 p-1 shadow-[inset_0_0_0_1px_var(--line)] [scrollbar-width:none] md:order-none md:col-span-1 [&::-webkit-scrollbar]:hidden">
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={section === item.href ? "page" : undefined}
            className={`shrink-0 rounded-full px-3.5 py-2 text-center text-sm font-bold whitespace-nowrap no-underline transition-[color,background-color] duration-150 ease-out-strong sm:px-5 ${
              section === item.href ? "bg-ink text-paper" : "text-ink-soft hover:text-ink"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="flex items-center justify-end gap-3 justify-self-end text-sm md:col-start-3">
        {session && (
          <span className="hidden items-center gap-2 text-ink-soft sm:flex" title="US stock market session">
            <span className={`size-2 rounded-full ${session.open ? "bg-ink" : "bg-gold"}`} aria-hidden />
            {session.label}
          </span>
        )}
        <WalletButton />
      </div>
    </header>
  )
}
