/**
 * Prices, per share of the underlying. Live prices come from Binance's keyless dynamic endpoint
 * (token price divided by the share multiplier), which also reports whether the asset trades right
 * now. History comes from the token's daily candles on BSC, with Yahoo for dates before the token
 * existed. Every quote says where it came from.
 */
import { dynamic, klines, marketStatus, type AssetStatus, type MarketStatus } from "./binance/public"
import { registry, tokenForTicker, wrappersFor, type StockToken } from "./registry"

export type Quote = {
  /** USD per share of the underlying. */
  price: number
  /** USD per token on BSC. */
  tokenPrice: number
  multiplier: number
  /** Unix seconds of the observation. */
  publishTime: number
  source: "binance:bstock" | "binance:xstock" | "binance:ondo"
  status: AssetStatus
  symbol: string
}

const cache = new Map<string, { quote: Quote; at: number }>()
const CACHE_MS = 20_000

async function quoteFor(token: StockToken): Promise<Quote> {
  const hit = cache.get(token.address)
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.quote
  const d = await dynamic(token.address)
  const tokenPrice = Number(d.tokenInfo.price)
  const multiplier = Number(d.tokenInfo.sharesMultiplier) || token.multiplier || 1
  if (!Number.isFinite(tokenPrice) || tokenPrice <= 0) throw new Error(`No live price for ${token.symbol}`)
  const quote: Quote = {
    price: tokenPrice / multiplier,
    tokenPrice,
    multiplier,
    publishTime: Math.floor(Date.now() / 1000),
    source: `binance:${token.platform}`,
    status: d.statusInfo,
    symbol: d.symbol,
  }
  cache.set(token.address, { quote, at: Date.now() })
  return quote
}

/** Live per-share price of a ticker through its best wrapper on BSC. */
export async function livePrice(ticker: string): Promise<Quote> {
  const reg = await registry()
  const token = tokenForTicker(reg, ticker) ?? wrappersFor(reg, ticker)[0]
  if (!token) throw new Error(`No tokenized stock for ${ticker}`)
  return quoteFor(token)
}

export async function livePriceOf(token: StockToken) {
  return quoteFor(token)
}

/** Live prices for many tickers; tickers with no wrapper or no price are left out. */
export async function livePrices(tickers: string[]) {
  const reg = await registry()
  const out = new Map<string, Quote>()
  await Promise.all(
    [...new Set(tickers)].map(async (t) => {
      const token = tokenForTicker(reg, t) ?? wrappersFor(reg, t)[0]
      if (!token) return
      try {
        out.set(t, await quoteFor(token))
      } catch {
        /* left out */
      }
    }),
  )
  return out
}

let market: { at: number; status: MarketStatus } | null = null

/** The US session state, cached for a minute. */
export async function session() {
  if (market && Date.now() - market.at < 60_000) return market.status
  const status = await marketStatus()
  market = { at: Date.now(), status }
  return status
}

export type DailyClose = { date: string; close: number; source: "binance" | "yahoo" }

/** Official close of the underlying on a date (the trade date or the disclosure date). */
export async function closeOn(ticker: string, date: Date): Promise<number | null> {
  const closes = await dailyCloses(ticker, new Date(date.getTime() - 6 * 86_400_000), date).catch(() => [])
  return closes.at(-1)?.close ?? null
}

/** Daily closes of the underlying from `from` to `to`, oldest first. */
export async function dailyCloses(ticker: string, from: Date, to = new Date()): Promise<DailyClose[]> {
  const reg = await registry()
  const token = tokenForTicker(reg, ticker)
  const fromDay = from.toISOString().slice(0, 10)
  const toDay = to.toISOString().slice(0, 10)
  if (token) {
    const days = Math.min(500, Math.ceil((to.getTime() - from.getTime()) / 86_400_000) + 2)
    const candles = await klines(token.address, "1d", days).catch(() => [])
    const rows = candles
      .map((c) => ({ date: new Date(c.time).toISOString().slice(0, 10), close: c.close / token.multiplier, source: "binance" as const }))
      .filter((c) => c.date >= fromDay && c.date <= toDay)
    // Use the token's own history only when it covers the start of the window.
    if (rows.length && rows[0].date <= new Date(from.getTime() + 4 * 86_400_000).toISOString().slice(0, 10)) return rows
  }
  return yahooDailyCloses(ticker, from, to)
}

async function yahooDailyCloses(ticker: string, from: Date, to: Date): Promise<DailyClose[]> {
  const start = new Date(from)
  start.setUTCHours(0, 0, 0, 0)
  const p1 = Math.floor(start.getTime() / 1000)
  const p2 = Math.floor(to.getTime() / 1000) + 86400
  const res = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${ticker.replace(".", "-")}?period1=${p1}&period2=${p2}&interval=1d`,
    { headers: { "User-Agent": "Mozilla/5.0 (Tailcoat)" } },
  )
  if (!res.ok) throw new Error(`Price history ${res.status} for ${ticker}`)
  const body = (await res.json()) as {
    chart: { result?: { timestamp?: number[]; indicators: { quote: { close: (number | null)[] }[] } }[] }
  }
  const r = body.chart.result?.[0]
  const ts = r?.timestamp ?? []
  const closes = r?.indicators.quote[0]?.close ?? []
  const out: DailyClose[] = []
  ts.forEach((t, i) => {
    const c = closes[i]
    if (c != null) out.push({ date: new Date(t * 1000).toISOString().slice(0, 10), close: c, source: "yahoo" })
  })
  return out
}
