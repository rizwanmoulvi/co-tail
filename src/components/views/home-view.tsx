"use client"

import Link from "next/link"
import { useState } from "react"
import { FilingReceipt } from "@/components/filing-receipt"
import { FollowButton } from "@/components/follow-dialog"
import { MemberAvatar, PartySeat } from "@/components/member-avatar"
import { PageTitle } from "@/components/umbra"
import { pct, shortDay } from "@/lib/format"
import { useFeed, useLeaders } from "@/lib/queries"
import { cn } from "@/lib/utils"
import type { FilingView, LeaderRow } from "@/server/queries"

const KINDS = [
  { value: "all", label: "All" },
  { value: "house_ptr", label: "Congress" },
  { value: "form4", label: "Insiders" },
] as const

function mirrorLabel(source: FilingView["source"]) {
  if (source.kind === "house") return `Mirror ${source.name.split(" ").at(-1)}`
  return source.name.length <= 22 ? `Mirror ${source.name}` : "Mirror"
}

export function HomeView(props: { filings: FilingView[]; leaders: LeaderRow[] }) {
  const { data: filings = [] } = useFeed(props.filings)
  const { data: leaders = [] } = useLeaders(props.leaders)
  const [kind, setKind] = useState<(typeof KINDS)[number]["value"]>("all")
  const shown = filings.filter((f) => kind === "all" || f.kind === kind)
  const mirrorable = shown.filter((f) => f.trades.some((t) => t.tokenSymbol))
  const houseFirst = [...mirrorable].sort((a, b) => Number(b.kind === "house_ptr") - Number(a.kind === "house_ptr"))
  const [hero, ...rest] = kind === "all" && houseFirst.length ? houseFirst : mirrorable.length ? mirrorable : shown

  return (
    <div className="grid gap-10">
      <PageTitle
        lede="House reports and insider purchases as the agent reads them, newest first. Each price shows how far the stock moved between the trade and the report."
        action={
          <div className="flex gap-1 rounded-full bg-paper-3 p-1 shadow-[inset_0_0_0_1px_var(--line)]">
            {KINDS.map((k) => (
              <button
                key={k.value}
                type="button"
                aria-pressed={kind === k.value}
                onClick={() => setKind(k.value)}
                className={`rounded-full px-4 py-1.5 text-sm font-bold transition-[color,background-color] duration-150 ease-out-strong ${kind === k.value ? "bg-ink text-paper" : "text-ink-soft hover:text-ink"}`}
              >
                {k.label}
              </button>
            ))}
          </div>
        }
      >
        Filings
      </PageTitle>

      <div className="grid gap-x-16 gap-y-12 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="grid content-start gap-5">
          {hero ? (
            <FilingReceipt filing={hero} action={<FollowButton source={hero.source} size="default" label={mirrorLabel(hero.source)} />} />
          ) : (
            <p className="max-w-md leading-relaxed text-ink-soft">No filings read yet. New reports appear here within minutes of the House Clerk or the SEC publishing them.</p>
          )}
          {rest.slice(0, 6).map((f) => (
            <FilingReceipt key={f.id} filing={f} compact action={<FollowButton source={f.source} />} />
          ))}
        </section>

        <aside className="grid content-start gap-10">
          <section>
            <div className="flex items-baseline justify-between gap-4">
              <h2 className="font-heading text-[1.6rem] font-semibold tracking-[-0.3px]">Who to mirror</h2>
              <Link href="/app/people" className="text-sm font-bold text-gold-deep">
                Everyone
              </Link>
            </div>
            <ul className="mt-2">
              {leaders.slice(0, 8).map((m) => (
                <li key={m.slug} className="flex items-center gap-3 border-b border-line-soft py-3 last:border-b-0">
                  <MemberAvatar source={m} className="size-9" />
                  <div className="min-w-0 flex-1">
                    <Link href={`/app/p/${m.slug}`} className="block truncate font-bold hover:underline">
                      {m.name}
                    </Link>
                    <div className="flex min-w-0 items-center gap-2 text-sm">
                      <PartySeat source={m} />
                      {m.lastFiledAt && <span className="shrink-0 whitespace-nowrap text-ink-faint">{shortDay(m.lastFiledAt)}</span>}
                    </div>
                  </div>
                  {m.copyReturn != null && (
                    <span className={cn("font-mono text-sm", m.copyReturn >= 0 ? "text-gold-deep" : "text-danger")} title="Average move of tokenized buys since their report">
                      {pct(m.copyReturn)}
                    </span>
                  )}
                </li>
              ))}
              {leaders.length === 0 && <li className="py-4 text-sm text-ink-soft">No members yet.</li>}
            </ul>
          </section>

          <section className="border-l-2 border-gold pl-4">
            <p className="font-bold">Exits run for you</p>
            <p className="mt-1 text-sm leading-relaxed text-ink-soft">
              Reports can arrive weeks after a sale, so every position has a trailing stop and a time limit you choose when you start mirroring. The worker checks them every 20 seconds.
            </p>
          </section>
        </aside>
      </div>
    </div>
  )
}
