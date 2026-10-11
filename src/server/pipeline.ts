/**
 * The loop the worker runs: read new filings, write their receipts, mirror their trades, guard
 * the exits. Each step is idempotent and picks up where the last run stopped. Every tick leaves a
 * run record; every refused or failed mirror is kept with its reason.
 */
import { and, asc, desc, eq, inArray, isNull, lt, lte } from "drizzle-orm"
import type { Address } from "viem"
import { followerCash, followerStock, isAllowedStock, mirrorBuy, mirrorSell, writeReceipt } from "./bsc/executor"
import { db, schema } from "./db"
import { readHouseFiling, syncHouseIndex } from "./ingest/house"
import { syncForm4 } from "./ingest/sec"
import { livePrice, livePrices, session, type Quote } from "./prices"
import { incident, recordRun } from "./record"
import { registry, tokenBySymbol, type StockToken } from "./registry"

const log = (...args: unknown[]) => console.log(new Date().toISOString(), ...args)

let lastForm4 = 0
const FORM4_EVERY_MS = 10 * 60_000

export async function ingest() {
  const added = await syncHouseIndex(Number(process.env.HOUSE_INDEX_WINDOW || 1000))
  if (added) log(`index: ${added} new filings`)
  let form4 = 0
  if (Date.now() - lastForm4 > FORM4_EVERY_MS) {
    lastForm4 = Date.now()
    const r = await syncForm4(1, 150)
    form4 = r.trades
    if (r.trades) log(`form4: ${r.trades} insider purchases from ${r.candidates} filings`)
  }
  return { added, form4 }
}

/** Members read first: the names people already search for. */
const WATCHLIST = (process.env.HOUSE_WATCHLIST || "pelosi,khanna,gottheimer,mccaul,greene,crenshaw,tuberville")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean)

let readsPausedUntil = 0

export async function readFilings(limit = Number(process.env.READ_BATCH || 10)) {
  if (Date.now() < readsPausedUntil) return 0
  const pending = await db
    .select({ filing: schema.filings, name: schema.sources.name })
    .from(schema.filings)
    .innerJoin(schema.sources, eq(schema.sources.id, schema.filings.sourceId))
    .where(eq(schema.filings.status, "new"))
    .orderBy(desc(schema.filings.filedAt))
  const watched = (n: string) => WATCHLIST.some((w) => n.toLowerCase().includes(w))
  const queue = [...pending.filter((p) => watched(p.name)), ...pending.filter((p) => !watched(p.name))]
    .slice(0, limit)
    .map((p) => p.filing)
  let read = 0
  await Promise.all(
    queue.map(async (f) => {
      try {
        const n = await readHouseFiling(f)
        read++
        log(`read ${f.docId}: ${n} trades`)
      } catch (err) {
        const message = await incident("reader", { docId: f.docId, url: f.url }, err)
        if (/credit|quota|402|429|rate limit/i.test(message)) {
          readsPausedUntil = Date.now() + 30 * 60_000
          log(`read ${f.docId} deferred: ${message.split("\n")[0]}; pausing reads for 30 min`)
          return
        }
        log(`read ${f.docId} failed: ${message}`)
        await db.update(schema.filings).set({ status: "failed", error: message.slice(0, 500) }).where(eq(schema.filings.id, f.id))
      }
    }),
  )
  return read
}

let warnedNoMirror = false

/** One Receipt event per parsed filing, carrying the sha256 of the bytes the agent read. */
export async function writeReceipts(limit = 5) {
  if (!process.env.NEXT_PUBLIC_MIRROR_ADDRESS) {
    // Nothing to write to yet; say so once instead of an incident every tick.
    if (!warnedNoMirror) log("receipts wait: NEXT_PUBLIC_MIRROR_ADDRESS is not set (deploy the contract with scripts/deploy.sh)")
    warnedNoMirror = true
    return 0
  }
  const queue = await db.query.filings.findMany({
    where: and(eq(schema.filings.status, "parsed"), isNull(schema.filings.receiptTx)),
    orderBy: asc(schema.filings.filedAt),
    limit,
  })
  let n = 0
  for (const f of queue) {
    if (!f.sha256) continue
    const trades = await db.query.trades.findMany({ where: eq(schema.trades.filingId, f.id) })
    const mirrored = trades.filter((t) => t.tokenSymbol).length
    try {
      const tx = await writeReceipt(f.sha256, `${f.kind}:${f.docId}`, trades.length, mirrored)
      await db.update(schema.filings).set({ receiptTx: tx, status: "receipted" }).where(eq(schema.filings.id, f.id))
      n++
      log(`receipt ${f.docId}: ${tx}`)
    } catch (err) {
      await incident("executor:receipt", { docId: f.docId }, err)
      log(`receipt ${f.docId} failed: ${err instanceof Error ? err.message : err}`)
      return n
    }
  }
  return n
}

export async function recordExecution(row: typeof schema.executions.$inferInsert) {
  await db.insert(schema.executions).values(row).onConflictDoNothing()
}

/** Prices older than this, or a paused asset, are not mirrored. */
function tradeable(q: Quote) {
  if (!q.status.openState) return `${q.symbol} is not trading: ${q.status.reasonMsg ?? q.status.reasonCode ?? "paused"}`
  return null
}

/** Mirrors one trade into every follower who followed before the trade arrived. */
async function mirrorTrade(trade: schema.Trade, filing: schema.Filing) {
  const reg = await registry()
  const token = trade.tokenSymbol ? tokenBySymbol(reg, trade.tokenSymbol) : null
  if (!token || !trade.ticker || !token.executable) {
    await db.update(schema.trades).set({ mirrorStatus: "skipped" }).where(eq(schema.trades.id, trade.id))
    return 0
  }
  // A filing often lists several lots of the same stock (shares and calls, several dates).
  // Followers get one mirror per stock and direction per filing: the lowest-id lot carries it.
  const sibling = await db.query.trades.findFirst({
    where: and(
      eq(schema.trades.filingId, trade.filingId),
      eq(schema.trades.tokenSymbol, token.symbol),
      eq(schema.trades.side, trade.side),
      lt(schema.trades.id, trade.id),
    ),
  })
  if (sibling) {
    await db.update(schema.trades).set({ mirrorStatus: "done" }).where(eq(schema.trades.id, trade.id))
    return 0
  }
  const followers = await db.query.follows.findMany({
    where: and(
      eq(schema.follows.sourceId, trade.sourceId),
      eq(schema.follows.active, true),
      eq(schema.follows.demo, false),
      lte(schema.follows.createdAt, trade.createdAt),
    ),
  })
  if (followers.length === 0) {
    await db.update(schema.trades).set({ mirrorStatus: "done" }).where(eq(schema.trades.id, trade.id))
    return 0
  }

  const quote = await livePrice(trade.ticker)
  const closed = tradeable(quote)
  if (closed) {
    // Leave the trade pending: the asset reopens and the next tick picks it up.
    log(`mirror ${token.symbol} waits: ${closed}`)
    return 0
  }
  if (!(await isAllowedStock(token))) {
    await incident("executor:allowlist", { symbol: token.symbol, address: token.address }, new Error("stock is not on the mirror's allowlist"))
    return 0
  }
  const base = { tradeId: trade.id, side: trade.side, tokenSymbol: token.symbol, refPx: quote.price, createdAt: new Date() } as const

  let done = 0
  await Promise.all(
    followers.map(async (f) => {
      const follower = f.wallet as Address
      try {
        if (trade.side === "buy") {
          const cash = await followerCash(follower)
          const usd = Math.min(f.perTradeUsd, cash.allowance, cash.balance, cash.spendable)
          if (usd < 1) {
            const reason = cash.paused
              ? "You paused Tailcoat on-chain."
              : cash.allowance < 1
                ? "Budget used up. Approve more USDT to keep mirroring."
                : cash.balance < 1
                  ? "Not enough USDT in wallet"
                  : "Your on-chain daily cap is used up for today"
            await recordExecution({ ...base, followId: f.id, wallet: f.wallet, status: "rejected", reason })
            return
          }
          const fill = await mirrorBuy({ follower, token, usd, refPrice: quote.price, filingSha256: filing.sha256 })
          await recordExecution({
            ...base,
            followId: f.id,
            wallet: f.wallet,
            cashAmount: fill.cashAmount,
            tokenAmount: fill.tokenAmount,
            quotePx: fill.quotePx,
            fillPx: fill.cashAmount / (fill.tokenAmount * token.multiplier),
            route: fill.route,
            simulatedBy: fill.simulatedBy,
            txHash: fill.hash,
            status: "confirmed",
          })
          await openPosition({ follow: f, trade, symbol: token.symbol, tokens: fill.tokenAmount, usd: fill.cashAmount, price: quote.price })
          done++
        } else {
          // Sell only what was bought by mirroring this member.
          const open = await db.query.positions.findMany({
            where: and(eq(schema.positions.followId, f.id), eq(schema.positions.tokenSymbol, token.symbol), eq(schema.positions.status, "open")),
          })
          const owned = open.reduce((a, p) => a + p.tokens, 0)
          if (owned <= 0) {
            await recordExecution({ ...base, followId: f.id, wallet: f.wallet, status: "rejected", reason: `No ${token.symbol} bought from this member to sell` })
            return
          }
          const held = await followerStock(follower, token)
          const tokens = Math.min(owned, held.tokens, held.sellable)
          if (tokens <= 0) {
            for (const p of open) await markExitDue(p, "The member sold: allow Tailcoat to sell")
            await recordExecution({ ...base, followId: f.id, wallet: f.wallet, status: "rejected", reason: "Selling is not allowed yet. Allow it from your portfolio." })
            return
          }
          const fill = await mirrorSell({ follower, token, tokens, refPrice: quote.price, filingSha256: filing.sha256 })
          await recordExecution({
            ...base,
            followId: f.id,
            wallet: f.wallet,
            cashAmount: fill.cashAmount,
            tokenAmount: fill.tokenAmount,
            quotePx: fill.quotePx,
            fillPx: fill.cashAmount / (fill.tokenAmount * token.multiplier),
            route: fill.route,
            simulatedBy: fill.simulatedBy,
            txHash: fill.hash,
            status: "confirmed",
          })
          for (const p of open) await closePosition(p, "member_sold", quote.price, fill.hash)
          done++
        }
      } catch (err) {
        const reason = await incident("executor:mirror", { follower: f.wallet, symbol: token.symbol, side: trade.side }, err)
        await recordExecution({ ...base, followId: f.id, wallet: f.wallet, status: "failed", reason: reason.slice(0, 300) })
      }
    }),
  )
  await db.update(schema.trades).set({ mirrorStatus: "done" }).where(eq(schema.trades.id, trade.id))
  log(`mirrored ${trade.side} ${token.symbol} for ${done}/${followers.length} followers`)
  return done
}

export async function mirror(limit = 10) {
  const filings = await db.query.filings.findMany({ where: eq(schema.filings.status, "receipted") })
  if (!filings.length) return 0
  const byId = new Map(filings.map((f) => [f.id, f]))
  const queue = await db.query.trades.findMany({
    where: and(eq(schema.trades.mirrorStatus, "pending"), inArray(schema.trades.filingId, [...byId.keys()])),
    orderBy: asc(schema.trades.createdAt),
    limit,
  })
  let n = 0
  for (const trade of queue) {
    try {
      n += await mirrorTrade(trade, byId.get(trade.filingId)!)
    } catch (err) {
      await incident("pipeline:mirror", { tradeId: trade.id }, err)
      log(`mirror trade ${trade.id} failed: ${err instanceof Error ? err.message : err}`)
    }
  }
  return n
}

// ---------------------------------------------------------------------------------------------
// Positions and exit rules. Disclosures arrive late, so a member's sale may come after the drop.
// Each position carries its own exits, checked against live prices every tick: a trailing stop
// from the highest price seen, and a maximum holding period.

export async function openPosition(opts: { follow: schema.Follow; trade: schema.Trade; symbol: string; tokens: number; usd: number; price: number }) {
  const existing = await db.query.positions.findFirst({
    where: and(eq(schema.positions.followId, opts.follow.id), eq(schema.positions.tokenSymbol, opts.symbol), eq(schema.positions.status, "open")),
  })
  if (existing) {
    const tokens = existing.tokens + opts.tokens
    const cost = existing.costUsd + opts.usd
    await db
      .update(schema.positions)
      .set({ tokens, costUsd: cost, entryPx: cost / tokens, peakPx: Math.max(existing.peakPx, opts.price), lastPx: opts.price })
      .where(eq(schema.positions.id, existing.id))
    return
  }
  await db.insert(schema.positions).values({
    wallet: opts.follow.wallet,
    followId: opts.follow.id,
    tradeId: opts.trade.id,
    tokenSymbol: opts.symbol,
    ticker: opts.trade.ticker!,
    tokens: opts.tokens,
    costUsd: opts.usd,
    entryPx: opts.price,
    peakPx: opts.price,
    lastPx: opts.price,
    openedAt: new Date(),
  })
}

export async function closePosition(p: schema.Position, reason: NonNullable<schema.Position["closeReason"]>, price: number, tx: string) {
  await db
    .update(schema.positions)
    .set({ status: "closed", closeReason: reason, closePx: price, closeTx: tx, closedAt: new Date(), exitDue: null, lastPx: price })
    .where(eq(schema.positions.id, p.id))
}

async function markExitDue(p: schema.Position, why: string) {
  if (p.exitDue !== why) await db.update(schema.positions).set({ exitDue: why }).where(eq(schema.positions.id, p.id))
}

export function exitReason(p: schema.Position, f: schema.Follow, price: number) {
  if (f.trailingStopPct && price <= p.peakPx * (1 - f.trailingStopPct)) {
    return { rule: "trailing_stop" as const, text: `Trailing stop: ${(((p.peakPx - price) / p.peakPx) * 100).toFixed(1)}% below the $${p.peakPx.toFixed(2)} peak` }
  }
  const days = (Date.now() - p.openedAt.getTime()) / 86_400_000
  if (f.maxHoldDays && days >= f.maxHoldDays) {
    return { rule: "max_hold" as const, text: `Held ${Math.floor(days)} days, the limit you set` }
  }
  return null
}

export async function guardExits() {
  const open = await db.query.positions.findMany({ where: eq(schema.positions.status, "open") })
  if (!open.length) return 0
  const reg = await registry()
  const prices = await livePrices(open.map((p) => p.ticker))
  const follows = await db.query.follows.findMany({
    where: and(inArray(schema.follows.id, [...new Set(open.map((p) => p.followId))]), eq(schema.follows.demo, false)),
  })
  const followById = new Map(follows.map((f) => [f.id, f]))
  let exits = 0

  for (const p of open) {
    const quote = prices.get(p.ticker)
    const f = followById.get(p.followId)
    if (!quote || !f) continue
    const peak = Math.max(p.peakPx, quote.price)
    if (peak !== p.peakPx || quote.price !== p.lastPx) {
      await db.update(schema.positions).set({ peakPx: peak, lastPx: quote.price }).where(eq(schema.positions.id, p.id))
    }
    const exit = exitReason({ ...p, peakPx: peak }, f, quote.price)
    if (!exit) continue
    const token: StockToken | null = tokenBySymbol(reg, p.tokenSymbol)
    if (!token) continue
    if (tradeable(quote)) {
      await markExitDue(p, `${exit.text}. Waiting for ${token.symbol} to trade again.`)
      continue
    }
    try {
      const follower = p.wallet as Address
      const held = await followerStock(follower, token)
      const tokens = Math.min(p.tokens, held.tokens, held.sellable)
      if (held.tokens <= 0) {
        await closePosition(p, "manual", quote.price, "")
        continue
      }
      if (tokens <= 0) {
        await markExitDue(p, exit.text)
        continue
      }
      const filing = await db.query.filings.findFirst({
        where: eq(schema.filings.id, (await db.query.trades.findFirst({ where: eq(schema.trades.id, p.tradeId) }))?.filingId ?? -1),
      })
      const fill = await mirrorSell({ follower, token, tokens, refPrice: quote.price, filingSha256: filing?.sha256 ?? null })
      await recordExecution({
        tradeId: p.tradeId,
        followId: p.followId,
        wallet: p.wallet,
        side: "sell",
        tokenSymbol: token.symbol,
        cashAmount: fill.cashAmount,
        tokenAmount: fill.tokenAmount,
        refPx: quote.price,
        quotePx: fill.quotePx,
        fillPx: fill.cashAmount / (fill.tokenAmount * token.multiplier),
        route: fill.route,
        simulatedBy: fill.simulatedBy,
        txHash: fill.hash,
        status: "confirmed",
        reason: exit.text,
        createdAt: new Date(),
      })
      await closePosition(p, exit.rule, quote.price, fill.hash)
      exits++
      log(`exit ${exit.rule} ${token.symbol} for ${p.wallet}`)
    } catch (err) {
      await incident("executor:exit", { positionId: p.id, wallet: p.wallet, symbol: p.tokenSymbol }, err)
      log(`exit ${p.tokenSymbol} for ${p.wallet} failed: ${err instanceof Error ? err.message : err}`)
    }
  }
  return exits
}

/** Slow loop: pull new filings and read them. EDGAR and the House index are polled politely. */
export async function ingestTick() {
  return recordRun("ingest", async () => {
    const i = await ingest()
    const read = process.env.OPENROUTER_API_KEY || process.env.SARVAM_API_KEY ? await readFilings() : 0
    return { ...i, read }
  })
}

/** Fast loop: receipts, mirrors and exits. Kept separate so a slow ingest never delays an exit. */
export async function tradeTick() {
  return recordRun("trade", async () => {
    const s = await session().catch(() => null)
    const receipts = await writeReceipts().catch(async (e) => (await incident("pipeline:receipts", null, e), 0))
    const mirrors = await mirror().catch(async (e) => (await incident("pipeline:mirror", null, e), 0))
    const exits = await guardExits().catch(async (e) => (await incident("pipeline:exits", null, e), 0))
    return { receipts, mirrors, exits, market: s?.marketStatus ?? "unknown" }
  })
}

/** Keeps the registry fresh so a stock that lists today is mirrorable today. */
export async function registryTick() {
  return recordRun("registry", async () => {
    const reg = await registry()
    return { tokens: Object.keys(reg.tokens).length, builtAt: reg.builtAt }
  })
}

export async function tick() {
  await ingestTick()
  await tradeTick()
}
