import Link from "next/link"
import { MemberAvatar, PartySeat } from "@/components/member-avatar"
import { explorerTx } from "@/lib/chain"
import { amountRange, day, lagDays, pct, shortDay, usd } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { FilingView, TradeView } from "@/server/queries"

function Move({ from, to, label }: { from: number | null; to: number | null; label: string }) {
  if (from == null || to == null) return <span className="text-ink-faint">-</span>
  const change = to / from - 1
  return (
    <span className="whitespace-nowrap" title={label}>
      <span className="text-ink-faint">{usd(from)}</span>
      <span className="px-1 text-ink-faint">to</span>
      <span>{usd(to)}</span>
      <span className={cn("ml-1.5", change >= 0 ? "text-gold-deep" : "text-danger")}>{pct(change)}</span>
    </span>
  )
}

/** Option lots carry their contract details in parentheses; the row drops them. */
function shortAsset(name: string) {
  return name.replace(/\s*\((Purchased|Sold|Exercised)[^)]*\)\s*$/i, "").replace(/\s*-\s*Common Stock$/i, "")
}

function TradeLine({ trade }: { trade: TradeView }) {
  const lag = lagDays(trade.tradedAt, trade.disclosedAt)
  const mirrored = !!trade.tokenSymbol
  return (
    <li className="grid grid-cols-[3rem_minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-0.5 border-b border-line-soft py-3 last:border-b-0">
      <span className={cn("text-sm font-bold", trade.side === "buy" ? "text-gold-deep" : "text-danger")}>{trade.side === "buy" ? "Buy" : "Sell"}</span>
      <span className="flex min-w-0 items-baseline gap-2">
        <span className="font-mono text-[0.95rem] text-ink">{trade.ticker ?? "-"}</span>
        <span className="truncate text-sm text-ink-soft">{shortAsset(trade.assetName)}</span>
        {/call option/i.test(trade.assetName) && <span className="text-[0.76rem] tracking-[0.5px] text-ink-faint uppercase">calls</span>}
      </span>
      <span className="text-right font-mono text-sm text-ink">{amountRange(trade.amountLow, trade.amountHigh)}</span>
      <span className="col-start-2 col-end-4 flex flex-wrap items-baseline justify-between gap-x-4 font-mono text-[0.8rem]">
        <span className="text-ink-faint">
          {shortDay(trade.tradedAt)}, reported {lag}d later
        </span>
        {mirrored ? (
          <Move from={trade.pxTraded} to={trade.pxDisclosed} label="Move between the trade and its report: the part a copier cannot capture" />
        ) : (
          <span className="text-ink-faint">not tokenized</span>
        )}
      </span>
    </li>
  )
}

/** A filing as a sheet of paper: the member, each disclosed trade, and the on-chain receipt at the foot. */
export function FilingReceipt({ filing, action, compact = false }: { filing: FilingView; action?: React.ReactNode; compact?: boolean }) {
  const trades = compact ? filing.trades.slice(0, 4) : filing.trades
  const hidden = filing.trades.length - trades.length
  const mirrorable = filing.trades.filter((t) => t.tokenSymbol).length
  return (
    <article className="rounded-lg bg-paper-2 px-5 pt-5 pb-4 shadow-[inset_0_0_0_1.5px_var(--line)] sm:px-6">
      <header className="flex items-center gap-4">
        <MemberAvatar source={filing.source} className="size-12" />
        <div className="min-w-0 flex-1">
          <Link href={`/app/p/${filing.source.slug}`} className="block truncate font-heading text-[1.3rem] leading-tight font-semibold tracking-[-0.3px] hover:underline">
            {filing.source.name}
          </Link>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
            <PartySeat source={filing.source} />
            <span className="text-sm text-ink-faint">Filed {day(filing.filedAt)}</span>
          </div>
        </div>
        <a href={filing.url} target="_blank" rel="noreferrer" className="hidden font-mono text-[0.8rem] text-ink-soft hover:text-ink sm:inline">
          {filing.kind === "form4" ? "Form 4" : `PTR ${filing.docId}`}
        </a>
      </header>

      <ol className="mt-4 border-t border-line">
        {trades.map((t) => (
          <TradeLine key={t.id} trade={t} />
        ))}
      </ol>
      {hidden > 0 && (
        <Link href={`/app/p/${filing.source.slug}`} className="block border-t border-line-soft py-2 text-sm text-ink-soft hover:text-ink">
          {hidden} more {hidden === 1 ? "trade" : "trades"} on this filing
        </Link>
      )}

      <footer className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-3">
        {filing.receiptTx ? (
          <a href={explorerTx(filing.receiptTx)} target="_blank" rel="noreferrer" className="font-mono text-[0.8rem] text-gold-deep hover:underline" title="The Receipt event holding the filing's sha256 hash, written before any mirror">
            Receipt {filing.receiptTx.slice(0, 10)}
          </a>
        ) : (
          <span className="font-mono text-[0.8rem] text-ink-faint">Receipt pending</span>
        )}
        {filing.sha256 && (
          <span className="hidden font-mono text-[0.8rem] text-ink-faint sm:inline" title={filing.sha256}>
            sha256 {filing.sha256.slice(0, 12)}
          </span>
        )}
        <span className="font-mono text-[0.8rem] text-ink-faint">
          {mirrorable}/{filing.trades.length} tokenized{filing.mirrors > 0 && `, ${filing.mirrors} mirrored`}
        </span>
        {action && <div className="ml-auto">{action}</div>}
      </footer>
    </article>
  )
}
