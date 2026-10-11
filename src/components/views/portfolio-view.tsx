"use client"

import Link from "next/link"
import { useAccount } from "wagmi"
import { MemberAvatar, PartySeat } from "@/components/member-avatar"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { LineRow, StatTile } from "@/components/umbra"
import { FillsTable } from "@/components/views/receipts-view"
import { WalletButton } from "@/components/wallet-button"
import { explorerTx } from "@/lib/chain"
import { pct, shortDay, usd } from "@/lib/format"
import { useMe, type PositionView } from "@/lib/queries"
import { cn } from "@/lib/utils"
import { useWalletCalls } from "@/lib/wallet-tx"

const CLOSED: Record<NonNullable<PositionView["closeReason"]>, string> = {
  member_sold: "Sold, the member sold",
  trailing_stop: "Sold, trailing stop",
  max_hold: "Sold, time limit",
  manual: "Closed",
}

function Status({ p }: { p: PositionView }) {
  if (p.status === "closed") {
    const text = CLOSED[p.closeReason ?? "manual"]
    return p.closeTx ? (
      <a href={explorerTx(p.closeTx)} target="_blank" rel="noreferrer" className="font-bold text-gold-deep hover:underline">
        {text}
      </a>
    ) : (
      <span className="text-ink-soft">{text}</span>
    )
  }
  if (p.exitDue) return <span className="font-bold text-danger">Exit due</span>
  if (!p.sellAllowed) return <span className="text-ink-soft">Selling not allowed yet</span>
  return <span className="font-bold text-gold-deep">Protected</span>
}

export function PortfolioView() {
  const { address: wallet } = useAccount()
  const me = useMe(wallet)
  const revoke = useWalletCalls({ buildPath: "/api/revoke/build", intent: { type: "revoke" }, done: "Allowance revoked and mirroring paused. Tailcoat can no longer spend your USDT." })
  const allowExits = useWalletCalls({ buildPath: "/api/autosell/build", intent: { type: "autosell" }, done: "Exits are on. Tailcoat can now sell these positions for you." })

  if (!wallet) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h1 className="font-heading text-[clamp(2.6rem,8vw,4.5rem)] leading-none font-medium tracking-[-0.02em]">Portfolio</h1>
        <p className="mx-auto mt-5 max-w-[36ch] leading-relaxed text-ink-soft">Your positions, exit rules and the people you mirror appear here once a BNB Chain wallet is connected.</p>
        <div className="mt-8 flex justify-center">
          <WalletButton />
        </div>
      </div>
    )
  }

  const data = me.data
  const follows = data?.follows.filter((f) => f.active) ?? []
  const positions = data?.positions ?? []
  const open = positions.filter((p) => p.status === "open")
  const unprotected = open.filter((p) => !p.sellAllowed)
  const value = open.reduce((a, p) => a + p.tokens * (p.lastPx ?? p.entryPx), 0)
  const cost = open.reduce((a, p) => a + p.costUsd, 0)

  return (
    <div className="grid gap-x-16 gap-y-12 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-w-0 flex-col gap-12">
        <section>
          <p className="text-sm text-ink-soft">Mirrored positions</p>
          <p className="mt-1 font-heading text-[clamp(3.6rem,11vw,6rem)] leading-[0.95] font-medium tracking-[-1.5px]">{usd(value)}</p>
          <p className="mt-3 text-sm text-ink-soft">
            {open.length ? `${open.length} open, ${pct(cost ? value / cost - 1 : null)} on ${usd(cost)} of cost` : "Nothing held yet"}. {usd(data?.cash.balance ?? 0)} USDT in the wallet.
          </p>
          {unprotected.length > 0 && (
            <div className="mt-7 max-w-xl border-l-2 border-gold pl-4">
              <p className="font-bold">Let Tailcoat sell {unprotected.length === 1 ? "this position" : "these positions"}</p>
              <p className="mt-1 text-sm leading-relaxed text-ink-soft">
                Your trailing stop and time limit can only run once you allow Tailcoat to sell {[...new Set(unprotected.map((p) => p.tokenSymbol))].join(", ")}. The approval covers only these stocks and you can revoke it from any wallet.
              </p>
              <Button size="sm" className="mt-3 rounded-full" onClick={() => allowExits.mutate()} disabled={allowExits.isPending}>
                {allowExits.isPending && <Spinner data-icon="inline-start" />}
                Allow selling
              </Button>
            </div>
          )}
        </section>

        <section>
          <h2 className="font-heading text-[1.6rem] font-semibold tracking-[-0.3px]">Positions</h2>
          {positions.length === 0 ? (
            <p className="mt-4 max-w-md leading-relaxed text-ink-soft">When someone you mirror reports a purchase, the stock bought for you shows up here with its exit rules.</p>
          ) : (
            <ul className="mt-2">
              {positions.map((p) => {
                const now = p.status === "closed" ? p.closePx : p.lastPx
                const change = now ? now / p.entryPx - 1 : null
                return (
                  <li key={p.id} className="flex flex-wrap items-center gap-x-5 gap-y-3 border-b border-line-soft py-5 last:border-b-0" title={p.exitDue ?? undefined}>
                    <span className="grid size-11 flex-none place-items-center rounded-full bg-paper-2 font-heading text-xl font-semibold shadow-[inset_0_0_0_1.5px_var(--line)]" aria-hidden>
                      {p.ticker[0]}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[1.05rem] font-bold">{p.tokenSymbol}</p>
                      <p className="truncate text-sm text-ink-soft">
                        {p.source ? (
                          <>
                            copies <Link href={`/app/p/${p.source.slug}`} className="hover:underline">{p.source.name}</Link>
                          </>
                        ) : (
                          "-"
                        )}
                        , bought {shortDay(p.openedAt)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-[1.05rem]">
                        {usd(now)}
                        {change != null && <span className={cn("ml-1.5 text-sm", change >= 0 ? "text-gold-deep" : "text-danger")}>{pct(change)}</span>}
                      </p>
                      <p className="text-sm text-ink-soft">
                        {p.tokens.toFixed(4)} at {usd(p.entryPx)}, {usd(p.costUsd)} in
                      </p>
                    </div>
                    <div className="w-full text-sm sm:w-48 sm:text-right">
                      <Status p={p} />
                      {p.status === "open" && (
                        <p className="text-ink-soft">
                          stop {usd(p.stopPx)}
                          {p.sellBy ? `, sell by ${shortDay(p.sellBy)}` : ""}
                        </p>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section>
          <h2 className="font-heading text-[1.6rem] font-semibold tracking-[-0.3px]">Fills</h2>
          <div className="mt-4">
            <FillsTable rows={data?.executions ?? []} showWallet={false} />
          </div>
        </section>
      </div>

      <aside className="flex flex-col gap-10">
        <section>
          <div className="flex flex-wrap gap-3">
            <StatTile label="Allowance left" value={usd(data?.cash.allowance ?? 0)} hint={data?.cash.paused ? "Paused on-chain" : "The most Tailcoat can still spend"} warn={!!data?.cash.paused} />
            <StatTile label="Today" value={usd(data?.cash.spendable ?? 0)} hint={`of a ${usd(data?.cash.dailyCap ?? 0, 0)} daily cap, ${usd(data?.cash.maxPerTrade ?? 0, 0)} per trade`} />
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" className="mt-4 w-full rounded-full" disabled={revoke.isPending || !data?.cash.allowance}>
                {revoke.isPending && <Spinner data-icon="inline-start" />}
                Revoke and pause
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="rounded-lg bg-paper-2 shadow-[inset_0_0_0_1.5px_var(--line)]">
              <AlertDialogHeader>
                <AlertDialogTitle className="font-heading text-[1.45rem] font-semibold">Stop all mirroring?</AlertDialogTitle>
                <AlertDialogDescription className="text-ink-soft">
                  Two transactions: the USDT approval goes to zero and your wallet is paused on the Tailcoat contract, so no new purchases are made for anyone you follow. Stocks you already hold stay in your wallet.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="rounded-full">Keep mirroring</AlertDialogCancel>
                <AlertDialogAction className="rounded-full bg-danger text-paper hover:bg-danger/90" onClick={() => revoke.mutate()}>
                  Revoke and pause
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </section>

        <section>
          <h2 className="font-heading text-[1.6rem] font-semibold tracking-[-0.3px]">Mirroring</h2>
          {follows.length ? (
            <ul className="mt-2">
              {follows.map((f) => (
                <li key={f.id} className="flex items-center gap-3 border-b border-line-soft py-3 last:border-b-0">
                  <MemberAvatar source={f.source} className="size-9" />
                  <div className="min-w-0 flex-1">
                    <Link href={`/app/p/${f.source.slug}`} className="block truncate font-bold hover:underline">
                      {f.source.name}
                    </Link>
                    <PartySeat source={f.source} />
                  </div>
                  <div className="text-right text-sm">
                    <p className="font-mono">{usd(f.perTradeUsd, 0)} a trade</p>
                    <p className="text-ink-soft">
                      stop {f.trailingStopPct ? `${Math.round(f.trailingStopPct * 100)}%` : "off"}, {f.maxHoldDays ? `${f.maxHoldDays}d` : "no limit"}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm leading-relaxed text-ink-soft">
              You are not mirroring anyone yet. Pick a member of Congress or an insider on the <Link href="/app/people" className="font-bold text-gold-deep">People</Link> page.
            </p>
          )}
        </section>

        <section>
          <LineRow label="Wallet" value={usd(data?.cash.balance ?? 0)} sub="USDT on BNB Chain" />
          <LineRow label="Open positions" value={String(open.length)} />
          <LineRow label="Fills" value={String(data?.executions.filter((e) => e.status === "confirmed").length ?? 0)} />
        </section>
      </aside>
    </div>
  )
}
