// Small pieces of the Umbra layout that several pages share, as ProX has them.

import type { ReactNode } from "react"

/** Umbra's section heading: small, uppercase, letterspaced, in faint ink. */
export function SectionLabel({ children, action, className = "" }: { children: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={`flex items-center justify-between text-[0.76rem] tracking-[1.5px] text-ink-faint uppercase ${className}`}>
      <span>{children}</span>
      {action}
    </div>
  )
}

/** Umbra's stat tile: label above a bold value, on a raised paper surface. */
export function StatTile({ label, value, hint, warn }: { label: string; value: ReactNode; hint?: string; warn?: boolean }) {
  return (
    <div className="flex min-w-[90px] flex-1 flex-col gap-[5px] rounded-lg bg-paper-2 p-4 shadow-[inset_0_0_0_1.5px_var(--line)]">
      <span className="text-[0.76rem] tracking-[0.5px] text-ink-faint uppercase">{label}</span>
      <span className={`text-[1.15rem] font-bold ${warn ? "text-danger" : "text-ink"}`}>{value}</span>
      {hint && <span className="text-[0.76rem] text-ink-faint">{hint}</span>}
    </div>
  )
}

/** A hairline row: label on the left, value on the right. */
export function LineRow({ label, value, sub }: { label: ReactNode; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line-soft px-0.5 py-2.5 last:border-b-0">
      <span className="text-sm text-ink-soft">
        {label}
        {sub && <span className="block text-[0.76rem] text-ink-faint">{sub}</span>}
      </span>
      <span className="text-right font-mono text-sm tracking-[0.3px] text-ink">{value}</span>
    </div>
  )
}

/** The page heading style every app page shares. */
export function PageTitle({ children, lede, action }: { children: ReactNode; lede?: ReactNode; action?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
      <div>
        <h1 className="font-heading text-[clamp(2.2rem,5vw,3.2rem)] leading-[1.02] font-semibold tracking-[-0.02em]">{children}</h1>
        {lede && <p className="mt-3 max-w-[58ch] leading-[1.6] text-ink-soft">{lede}</p>}
      </div>
      {action}
    </header>
  )
}
