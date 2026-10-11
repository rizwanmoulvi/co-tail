/**
 * Ticker to tokenized stock on BSC. Built from Binance's public lists (bStocks, xStocks, Ondo),
 * cached on disk and refreshed hourly, so a stock that lists tomorrow is mirrorable tomorrow.
 * bStocks come first: they are the Binance-issued wrapper, they trade on PancakeSwap, and the
 * hackathon's own data API covers them. xStocks on BSC are the fallback. Ondo is shown but never
 * executed by the operator: it fills only through RFQ, which needs the follower's own signature.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { eq } from "drizzle-orm"
import { PLATFORM, PLATFORM_NAME, rwaList, type Platform, type RwaListRow } from "./binance/public"
import { db, schema } from "./db"

export type StockToken = {
  /** Tokenized symbol, e.g. "NVDAB". */
  symbol: string
  /** US ticker of the underlying, e.g. "NVDA". */
  underlying: string
  /** BSC contract address, lowercase. */
  address: `0x${string}`
  decimals: number
  /** Share equivalents per token. Per-share price = token price / multiplier. */
  multiplier: number
  platform: "bstock" | "xstock" | "ondo"
  /** Can the operator fill it through an AMM route? Ondo cannot. */
  executable: boolean
}

export type Registry = {
  builtAt: string
  /** Every BSC token, by lowercase address. */
  tokens: Record<string, StockToken>
}

const CACHE_FILE = process.env.REGISTRY_CACHE || join(process.cwd(), "data", "registry.json")
const MAX_AGE_MS = Number(process.env.REGISTRY_MAX_AGE_MS || 60 * 60_000)

/** Share classes are written several ways on filings: BRK.B, BRK/B, BRK-B, BRKB. */
export function normalizeTicker(ticker: string) {
  return ticker.trim().toUpperCase().replace(/[./\s]/g, "-")
}

/** Builds the registry from list rows. Exported so tests can feed it fixtures. */
export function buildRegistry(rows: RwaListRow[], builtAt = new Date()): Registry {
  const tokens: Record<string, StockToken> = {}
  for (const r of rows) {
    if (r.chainId !== "56") continue
    if (!r.contractAddress?.startsWith("0x") || !r.ticker) continue
    const address = r.contractAddress.toLowerCase() as `0x${string}`
    const platform = PLATFORM_NAME[r.type]
    tokens[address] = {
      symbol: r.symbol,
      underlying: r.ticker.toUpperCase(),
      address,
      decimals: Number(r.d ?? 18),
      multiplier: Number(r.multiplier) || 1,
      platform,
      executable: platform !== "ondo",
    }
  }
  return { builtAt: builtAt.toISOString(), tokens }
}

let current: Registry | null = null
let loading: Promise<Registry> | null = null

const KV_KEY = "registry"

async function fetchAll(): Promise<Registry> {
  const platforms: Platform[] = [PLATFORM.bstock, PLATFORM.xstock, PLATFORM.ondo]
  const lists = await Promise.all(platforms.map((p) => rwaList(p)))
  const reg = buildRegistry(lists.flat())
  const json = JSON.stringify(reg)
  // The database is the cache of record (it is the only disk on Vercel); the file is a convenience.
  await db.insert(schema.kv).values({ key: KV_KEY, value: json }).onConflictDoUpdate({ target: schema.kv.key, set: { value: json } }).catch(() => {})
  try {
    await mkdir(dirname(CACHE_FILE), { recursive: true })
    await writeFile(CACHE_FILE, json)
  } catch {
    /* read-only filesystem */
  }
  return reg
}

async function fromDisk(): Promise<Registry | null> {
  try {
    return JSON.parse(await readFile(CACHE_FILE, "utf8")) as Registry
  } catch {
    try {
      const row = await db.query.kv.findFirst({ where: eq(schema.kv.key, KV_KEY) })
      return row ? (JSON.parse(row.value) as Registry) : null
    } catch {
      return null
    }
  }
}

/** The registry, refreshed when older than an hour. A failed refresh keeps the last good copy. */
export async function registry(): Promise<Registry> {
  if (current && Date.now() - Date.parse(current.builtAt) < MAX_AGE_MS) return current
  if (!loading) {
    loading = (async () => {
      const disk = current ?? (await fromDisk())
      if (disk && Date.now() - Date.parse(disk.builtAt) < MAX_AGE_MS) return (current = disk)
      try {
        return (current = await fetchAll())
      } catch (err) {
        if (disk) return (current = disk)
        throw err
      }
    })().finally(() => (loading = null))
  }
  return loading
}

/** Lets tests and scripts install a registry without the network. */
export function useRegistry(reg: Registry) {
  current = reg
}

const RANK: Record<StockToken["platform"], number> = { bstock: 0, xstock: 1, ondo: 2 }

/** Every wrapper of a ticker on BSC, best first. */
export function wrappersFor(reg: Registry, ticker: string | null | undefined): StockToken[] {
  if (!ticker) return []
  const t = normalizeTicker(ticker)
  const alt = t.replace(/-/g, "")
  return Object.values(reg.tokens)
    .filter((k) => k.underlying === t || k.underlying.replace(/[-./]/g, "") === alt)
    .sort((a, b) => RANK[a.platform] - RANK[b.platform])
}

/** The token a filing's ticker mirrors into: the best executable wrapper, or null. */
export function tokenForTicker(reg: Registry, ticker: string | null | undefined): StockToken | null {
  return wrappersFor(reg, ticker).find((k) => k.executable) ?? null
}

export function tokenBySymbol(reg: Registry, symbol: string): StockToken | null {
  return Object.values(reg.tokens).find((k) => k.symbol === symbol) ?? null
}

export function tokenByAddress(reg: Registry, address: string): StockToken | null {
  return reg.tokens[address.toLowerCase()] ?? null
}

export function executableCount(reg: Registry) {
  return Object.values(reg.tokens).filter((k) => k.executable).length
}
