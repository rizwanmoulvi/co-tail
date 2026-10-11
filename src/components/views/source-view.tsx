"use client"

import { FilingReceipt } from "@/components/filing-receipt"
import { FollowButton } from "@/components/follow-dialog"
import { MemberAvatar, PartySeat } from "@/components/member-avatar"
import { StatTile } from "@/components/umbra"
import { lagDays, pct } from "@/lib/format"
import { useSource, type SourceProfile } from "@/lib/queries"

export function SourceView({ slug, profile: initial }: { slug: string; profile: SourceProfile }) {
  const { data: profile = initial } = useSource(slug, initial)
  const { source, filings, followers } = profile
  const trades = filings.flatMap((f) => f.trades)
  const tokenized = trades.filter((t) => t.tokenSymbol)
  const buys = tokenized.filter((t) => t.side === "buy" && t.pxDisclosed && t.pxNow)
  const copy = buys.length ? buys.reduce((a, t) => a + (t.pxNow! / t.pxDisclosed! - 1), 0) / buys.length : null
  const lags = trades.map((t) => lagDays(t.tradedAt, t.disclosedAt))
  const medianLag = lags.length ? [...lags].sort((a, b) => a - b)[Math.floor(lags.length / 2)] : null

  return (
    <div className="grid gap-10">
      <header className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-center gap-5">
          <MemberAvatar source={source} className="size-20" />
          <div>
            <h1 className="font-heading text-[clamp(2.2rem,5vw,3.2rem)] leading-[1.02] font-semibold tracking-[-0.02em]">{source.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
              <PartySeat source={source} />
              <span className="text-sm text-ink-faint">
                {followers} {followers === 1 ? "wallet mirrors" : "wallets mirror"} this person
              </span>
            </div>
          </div>
        </div>
        <FollowButton source={source} size="lg" label={`Mirror ${source.name.split(" ").at(-1)}`} />
      </header>

      <div className="flex flex-wrap gap-3">
        <StatTile label="Trades reported" value={String(trades.length)} />
        <StatTile label="Tokenized on BSC" value={String(tokenized.length)} />
        <StatTile label="Median report delay" value={medianLag == null ? "-" : `${medianLag} days`} />
        <StatTile label="Copy return since report" value={pct(copy)} warn={copy != null && copy < 0} />
      </div>

      <section className="grid gap-5">
        <h2 className="font-heading text-[1.6rem] font-semibold tracking-[-0.3px]">Filings</h2>
        {filings.map((f) => (
          <FilingReceipt key={f.id} filing={f} />
        ))}
      </section>
    </div>
  )
}
