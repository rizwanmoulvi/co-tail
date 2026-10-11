import { eq } from "drizzle-orm"
import { db, schema } from "@/server/db"
import { fail, handle, ok } from "@/server/http"
import { registry, tokenForTicker, wrappersFor } from "@/server/registry"

/**
 * One parsed filing by its public document id (House DocID or EDGAR accession), with every trade
 * and the tokenized wrappers it maps to. This is what the Tailcoat Reader agent sells per call.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ docId: string }> }) {
  return handle(async () => {
    const { docId } = await ctx.params
    const filing = await db.query.filings.findFirst({ where: eq(schema.filings.docId, docId) })
    if (!filing || !["parsed", "receipted"].includes(filing.status)) return fail("No parsed filing with that id", 404)
    const [source, trades, reg] = await Promise.all([
      db.query.sources.findFirst({ where: eq(schema.sources.id, filing.sourceId) }),
      db.query.trades.findMany({ where: eq(schema.trades.filingId, filing.id) }),
      registry(),
    ])
    return ok({
      docId: filing.docId,
      kind: filing.kind,
      url: filing.url,
      sha256: filing.sha256,
      filedAt: filing.filedAt.toISOString(),
      readBy: filing.readBy,
      receiptTx: filing.receiptTx,
      source: source ? { slug: source.slug, name: source.name, kind: source.kind, seat: source.seat, affiliation: source.affiliation } : null,
      trades: trades.map((t) => {
        const best = tokenForTicker(reg, t.ticker)
        return {
          id: t.id,
          ticker: t.ticker,
          assetName: t.assetName,
          side: t.side,
          amountLow: t.amountLow,
          amountHigh: t.amountHigh,
          tradedAt: t.tradedAt.toISOString().slice(0, 10),
          disclosedAt: t.disclosedAt.toISOString().slice(0, 10),
          lagDays: Math.round((t.disclosedAt.getTime() - t.tradedAt.getTime()) / 86_400_000),
          pxTraded: t.pxTraded,
          pxDisclosed: t.pxDisclosed,
          token: best ? { symbol: best.symbol, address: best.address, platform: best.platform, multiplier: best.multiplier } : null,
          wrappers: wrappersFor(reg, t.ticker).map((w) => ({ symbol: w.symbol, address: w.address, platform: w.platform, executable: w.executable })),
        }
      }),
    })
  })
}
