/**
 * Imports the filings Coattails (Solana, Sept 2026) already read, so Tailcoat starts with real
 * parsed disclosures without re-reading them. Tickers are re-matched against the BSC registry.
 * Usage: npx tsx --env-file=.env scripts/import-coattails.ts /root/Projects/coattails/data/coattails.db
 */
import { createClient } from "@libsql/client"
import { eq } from "drizzle-orm"
import { db, schema } from "../src/server/db"
import { registry, tokenForTicker } from "../src/server/registry"

const file = process.argv[2]
if (!file) throw new Error("Usage: import-coattails.ts <coattails.db>")
const src = createClient({ url: `file:${file}` })
const reg = await registry()

const sources = (await src.execute("select * from sources")).rows
const sourceIds = new Map<number, number>()
for (const s of sources) {
  const [row] = await db
    .insert(schema.sources)
    .values({ slug: String(s.slug), kind: s.kind as "house" | "insider", name: String(s.name), seat: s.seat as string | null, affiliation: s.affiliation as string | null, photoUrl: s.photo_url as string | null, createdAt: new Date(Number(s.created_at) * 1000) })
    .onConflictDoUpdate({ target: schema.sources.slug, set: { name: String(s.name), photoUrl: s.photo_url as string | null } })
    .returning({ id: schema.sources.id })
  sourceIds.set(Number(s.id), row.id)
}

const filings = (await src.execute("select * from filings where status in ('parsed','receipted')")).rows
let nf = 0
let nt = 0
let matched = 0
for (const f of filings) {
  const sourceId = sourceIds.get(Number(f.source_id))!
  const existing = await db.query.filings.findFirst({ where: eq(schema.filings.docId, String(f.doc_id)) })
  let filingId: number
  if (existing) {
    filingId = existing.id
    if (existing.status !== "new") continue
    await db.update(schema.filings).set({ sha256: f.sha256 as string | null, status: "parsed", readBy: f.read_by as string | null }).where(eq(schema.filings.id, filingId))
  } else {
    const [row] = await db
      .insert(schema.filings)
      .values({
        sourceId,
        kind: f.kind as "house_ptr" | "form4",
        docId: String(f.doc_id),
        url: String(f.url),
        sha256: f.sha256 as string | null,
        filedAt: new Date(Number(f.filed_at) * 1000),
        status: "parsed",
        readBy: f.read_by as string | null,
        createdAt: new Date(),
      })
      .returning({ id: schema.filings.id })
    filingId = row.id
  }
  nf++
  const trades = (await src.execute({ sql: "select * from trades where filing_id = ?", args: [Number(f.id)] })).rows
  await db.delete(schema.trades).where(eq(schema.trades.filingId, filingId))
  for (const t of trades) {
    const ticker = (t.ticker as string | null) ?? null
    const token = t.token_symbol ? tokenForTicker(reg, ticker) : null
    if (token) matched++
    await db.insert(schema.trades).values({
      filingId,
      sourceId,
      ticker,
      assetName: String(t.asset_name),
      side: t.side as "buy" | "sell",
      amountLow: t.amount_low as number | null,
      amountHigh: t.amount_high as number | null,
      tradedAt: new Date(Number(t.traded_at) * 1000),
      disclosedAt: new Date(Number(t.disclosed_at) * 1000),
      tokenSymbol: token?.symbol ?? null,
      pxTraded: t.px_traded as number | null,
      pxDisclosed: t.px_disclosed as number | null,
      mirrorStatus: token ? "pending" : "skipped",
      createdAt: new Date(),
    })
    nt++
  }
}
console.log(`imported ${sources.length} sources, ${nf} filings, ${nt} trades (${matched} mirrorable on BSC)`)
