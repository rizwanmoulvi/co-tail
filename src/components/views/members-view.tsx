"use client"

import Link from "next/link"
import { FollowButton } from "@/components/follow-dialog"
import { MemberAvatar, PartySeat } from "@/components/member-avatar"
import { PageTitle } from "@/components/umbra"
import { pct, shortDay } from "@/lib/format"
import { useLeaders } from "@/lib/queries"
import { cn } from "@/lib/utils"
import type { LeaderRow } from "@/server/queries"

function Signed({ value, label }: { value: number | null; label: string }) {
  return (
    <div className="min-w-[7.5rem] text-right">
      <p className={cn("font-mono text-[1.05rem]", value == null ? "text-ink-faint" : value >= 0 ? "text-gold-deep" : "text-danger")}>{value == null ? "-" : pct(value)}</p>
      <p className="text-sm text-ink-soft">{label}</p>
    </div>
  )
}

export function MembersView(props: { leaders: LeaderRow[] }) {
  const { data: leaders = [] } = useLeaders(props.leaders)
  return (
    <div className="grid gap-10">
      <PageTitle lede="House members and company insiders whose recent filings the agent has read. Copy return is what a mirror would have made on their tokenized buys since the report. Report delay is how far the stock had already moved between the trade and the report.">
        People to mirror
      </PageTitle>
      <ul>
        {leaders.map((m) => (
          <li key={m.slug} className="flex flex-wrap items-center gap-x-5 gap-y-3 border-b border-line-soft py-5 last:border-b-0">
            <MemberAvatar source={m} className="size-11" />
            <div className="min-w-0 flex-1">
              <Link href={`/app/p/${m.slug}`} className="block truncate text-[1.05rem] font-bold hover:underline">
                {m.name}
              </Link>
              <div className="flex flex-wrap items-center gap-x-3 text-sm">
                <PartySeat source={m} />
                <span className="text-ink-soft">
                  {m.filings} {m.filings === 1 ? "filing" : "filings"}, {m.mirrorable} of {m.trades} trades tokenized
                  {m.lastFiledAt ? `, last filed ${shortDay(m.lastFiledAt)}` : ""}
                </span>
              </div>
            </div>
            <Signed value={m.copyReturn} label="copy return" />
            <Signed value={m.lagCost} label="report delay" />
            <div className="text-right text-sm text-ink-soft sm:min-w-[5rem]">
              {m.followers} {m.followers === 1 ? "wallet" : "wallets"}
            </div>
            <FollowButton source={m} />
          </li>
        ))}
        {leaders.length === 0 && <li className="py-8 text-ink-soft">No filings read yet.</li>}
      </ul>
    </div>
  )
}
