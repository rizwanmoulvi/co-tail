/**
 * Binance's keyless tokenized-stock endpoints, the ones its own Wallet Skills read. They need no
 * API key, so the registry, the price guard and the exits keep working if the signed API is down
 * or no key is configured. Verified live on 2026-10-10 (docs/INTEGRATIONS.md).
 */
const BASE = "https://www.binance.com/bapi/defi"
const UA = "Mozilla/5.0 (Tailcoat; +https://github.com/adilhusain01/tailcoat)"

export type Platform = 1 | 2 | 3
export const PLATFORM = { ondo: 1, xstock: 2, bstock: 3 } as const satisfies Record<string, Platform>
export const PLATFORM_NAME: Record<Platform, "ondo" | "xstock" | "bstock"> = { 1: "ondo", 2: "xstock", 3: "bstock" }

export type RwaListRow = {
  chainId: string
  contractAddress: string
  symbol: string
  ticker: string
  type: Platform
  /** 1 stock, 2 pre-IPO, 3 ETF; absent on some rows. */
  assetType?: number
  /** Share equivalents per token (dividends reinvested, splits). Token price / multiplier = per-share price. */
  multiplier: string
  d: number
}

type Envelope<T> = { code: string; message: string | null; data: T; success: boolean }

async function get<T>(path: string, params: Record<string, string | number | undefined> = {}): Promise<T> {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined) qs.set(k, String(v))
  const url = `${BASE}${path}${qs.size ? `?${qs}` : ""}`
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } })
  if (!res.ok) throw new Error(`Binance public ${res.status} for ${path}`)
  const body = (await res.json()) as Envelope<T>
  if (!body.success) throw new Error(`Binance public ${body.code} ${body.message ?? ""} for ${path}`)
  return body.data
}

/** Every tokenized stock Binance lists for a platform, across chains. */
export function rwaList(type: Platform) {
  return get<RwaListRow[]>("/v1/public/wallet-direct/buw/wallet/market/token/rwa/stock/detail/list/ai", { type })
}

export type AssetStatus = {
  openState: boolean
  marketStatus: string | null
  reasonCode: "TRADING" | "MARKET_CLOSED" | "MARKET_PAUSED" | "MARKET_MAINTENANCE" | "ASSET_PAUSED" | "ASSET_LIMITED" | "UNSUPPORTED" | null
  reasonMsg: string | null
  nextOpenTime: number | null
  nextCloseTime: number | null
}

export type Dynamic = {
  symbol: string
  ticker: string
  tokenInfo: {
    /** Token price in USD (not per share). */
    price: string | null
    priceChangePct24h: string | null
    sharesMultiplier: string | null
    volume24h: string | null
    bnTrader: string | null
    bnHolder: string | null
  }
  stockInfo: { price: string | null; priceHigh52w: string | null; priceLow52w: string | null; marketCap: string | null; priceToEarnings: string | null } | null
  statusInfo: AssetStatus
  type: Platform
}

/** Live token price, multiplier and status for one token on BSC. */
export function dynamic(contractAddress: string, chainId = "56") {
  return get<Dynamic>("/v2/public/wallet-direct/buw/wallet/market/token/rwa/dynamic/ai", { chainId, contractAddress })
}

export function assetStatus(contractAddress: string, chainId = "56") {
  return get<AssetStatus>("/v1/public/wallet-direct/buw/wallet/market/token/rwa/asset/market/status/ai", { chainId, contractAddress })
}

export type MarketStatus = {
  marketStatus: "closed" | "regular" | "premarket" | "postmarket" | "overnight" | "pause"
  openState: boolean
  reasonCode: string | null
  reasonMsg: string | null
  nextOpen: string | null
  nextClose: string | null
  nextOpenTime: number | null
  nextCloseTime: number | null
  /** The 24/5 off-hours session, which is what bStocks on an AMM actually trade in. */
  offhours: { openState: boolean; nextOpenTime: number | null; nextCloseTime: number | null } | null
}

/** Whether the US market (and the off-hours session) is open right now. */
export function marketStatus() {
  return get<MarketStatus>("/v1/public/wallet-direct/buw/wallet/market/token/rwa/market/status/ai")
}

export type Candle = { time: number; open: number; high: number; low: number; close: number; volume: number }

/** Daily (or intraday) candles of the token on BSC, oldest first. `limit` up to a few hundred. */
export async function klines(contractAddress: string, interval: "1d" | "1h" | "15m" = "1d", limit = 200, chainId = "56") {
  const data = await get<{ klineInfos: [number, string, string, string, string, string, number][]; decimals: number }>(
    "/v1/public/wallet-direct/buw/wallet/dex/market/token/kline/ai",
    { chainId, contractAddress, interval, limit },
  )
  return (data.klineInfos ?? []).map<Candle>(([t, o, h, l, c, v]) => ({
    time: t,
    open: Number(o),
    high: Number(h),
    low: Number(l),
    close: Number(c),
    volume: Number(v),
  }))
}
