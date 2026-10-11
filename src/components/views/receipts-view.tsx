"use client"

import Link from "next/link"
import { PageTitle } from "@/components/umbra"
import { explorerTx } from "@/lib/chain"
import { day, shortAddress, usd } from "@/lib/format"
import { useReceipts, type ReceiptsLog } from "@/lib/queries"
import { cn } from "@/lib/utils"
import type { ExecutionView } from "@/server/queries"

const STATUS: Record<string, string> = { confirmed: "Filled", rejected: "Skipped", failed: "Failed", sent: "Sent" }

function FillRow({ e, showWallet }: { e: ExecutionView; showWallet: boolean }) {
  return (
    <li className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-1 border-b border-line-soft py-3 last:border-b-0 sm:grid-cols-[6rem_minmax(0,1fr)_7rem_7rem_minmax(0,10rem)]">
      <span className="font-mono text-[0.8rem] text-ink-faint">{day(e.createdAt)}</span>
      <span className="min-w-0">
        <span className={cn("mr-2 text-sm font-bold", e.side === "buy" ? "text-gold-deep" : "text-danger")}>{e.side === "buy" ? "Buy" : "Sell"}</span>
        <span className="font-mono text-[0.95rem]">{e.tokenSymbol}</span>
        <span className="ml-2 text-sm text-ink-soft">
          copies <Link href={`/app/p/${e.sourceSlug}`} className="hover:underline">{e.sourceName}</Link>
          {showWallet && <span className="font-mono text-[0.8rem] text-ink-faint"> for {shortAddress(e.wallet)}</span>}
        </span>
      </span>
      <span className="text-right font-mono text-sm">{e.cashAmount != null ? usd(e.cashAmount) : "-"}</span>
      <span className="hidden text-right font-mono text-sm text-ink-soft sm:block">{e.fillPx != null ? `${usd(e.fillPx)}/sh` : "-"}</span>
      <span className="col-span-3 text-sm sm:col-span-1">
        {e.txHash ? (
          <a href={explorerTx(e.txHash)} target="_blank" rel="noreferrer" className="font-bold text-gold-deep hover:underline">
            {STATUS[e.status] ?? e.status}
            {e.route ? ` via ${e.route.replace("binance:", "Binance ").replace("pancake:v3:", "PancakeSwap ")}` : ""}
          </a>
        ) : (
          <span className="text-ink-soft" title={e.reason ?? undefined}>
            {STATUS[e.status] ?? e.status}
            {e.reason ? `: ${e.reason}` : ""}
          </span>
        )}
      </span>
    </li>
  )
}

export function FillsTable({ rows, showWallet = true }: { rows: ExecutionView[]; showWallet?: boolean }) {
  if (!rows.length) return <p className="py-6 text-ink-soft">No mirror fills yet.</p>
  return (
    <ul className="border-t border-line">
      {rows.map((e) => (
        <FillRow key={e.id} e={e} showWallet={showWallet} />
      ))}
    </ul>
  )
}

export function ReceiptsView({ log: initial }: { log: ReceiptsLog }) {
  const { data: log = initial } = useReceipts(initial)
  return (
    <div className="grid gap-12">
      <PageTitle lede="Before mirroring anything, the agent writes each filing's sha256 hash to BNB Chain as a Receipt event on the Tailcoat contract. Every fill below carries that receipt, so anyone can check which public document a trade copied, and which route and simulation vouched for it.">
        Receipts
      </PageTitle>

      <section>
        <h2 className="font-heading text-[1.6rem] font-semibold tracking-[-0.3px]">Mirror fills</h2>
        <div className="mt-4">
          <FillsTable rows={log.executions} />
        </div>
      </section>

      <section>
        <h2 className="font-heading text-[1.6rem] font-semibold tracking-[-0.3px]">Filing receipts</h2>
        {log.filings.length ? (
          <ul className="mt-4 border-t border-line">
            {log.filings.map((f) => (
              <li key={f.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-baseline gap-x-4 gap-y-1 border-b border-line-soft py-3 last:border-b-0 sm:grid-cols-[6rem_minmax(0,1fr)_minmax(0,12rem)_9rem]">
                <span className="font-mono text-[0.8rem] text-ink-faint">{day(f.filedAt)}</span>
                <span className="min-w-0 truncate">
                  <Link href={`/app/p/${f.source.slug}`} className="font-bold hover:underline">
                    {f.source.name}
                  </Link>
                  <a href={f.url} target="_blank" rel="noreferrer" className="ml-2 font-mono text-[0.8rem] text-ink-soft hover:text-ink">
                    {f.kind === "form4" ? `Form 4 ${f.docId}` : `PTR ${f.docId}`}
                  </a>
                </span>
                <span className="hidden truncate font-mono text-[0.8rem] text-ink-faint sm:block" title={f.sha256 ?? undefined}>
                  sha256 {f.sha256?.slice(0, 16)}
                </span>
                <span className="text-right text-sm">
                  {f.receiptTx ? (
                    <a href={explorerTx(f.receiptTx)} target="_blank" rel="noreferrer" className="font-mono text-[0.8rem] font-bold text-gold-deep hover:underline">
                      {f.receiptTx.slice(0, 10)}
                    </a>
                  ) : (
                    <span className="font-mono text-[0.8rem] text-ink-faint">pending</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-4 text-ink-soft">No receipts written yet. They start the moment the contract is deployed.</p>
        )}
      </section>
    </div>
  )
}
