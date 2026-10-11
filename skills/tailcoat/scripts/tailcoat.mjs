#!/usr/bin/env node
/**
 * Tailcoat helper for the Binance Agentic Wallet skill. Reads the Tailcoat API and keeps a local
 * ledger. Signs nothing. Node 18+, no dependencies.
 *
 *   tailcoat.mjs health | people | feed [--person s] [--limit n] | follow --person s --per-trade usd [--daily-cap usd]
 *   tailcoat.mjs pending | record --trade id --order id --tx hash --usd n --tokens n | ledger | unfollow --person s
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"

const API = (process.env.TAILCOAT_URL || "https://tailcoat.adilhusain.xyz").replace(/\/$/, "")
const LEDGER = process.env.TAILCOAT_LEDGER || join(homedir(), ".tailcoat", "ledger.json")
const USDT = "0x55d398326f99059fF775485246999027B3197955"

const [cmd, ...rest] = process.argv.slice(2)
const flags = {}
for (let i = 0; i < rest.length; i++) {
  if (rest[i].startsWith("--")) {
    const k = rest[i].slice(2)
    const v = rest[i + 1] && !rest[i + 1].startsWith("--") ? rest[++i] : true
    flags[k] = v
  }
}
const out = (data) => {
  console.log(JSON.stringify(flags.json ? { success: true, data } : data, null, 2))
}
const die = (message) => {
  console.log(JSON.stringify({ success: false, error: { message } }, null, 2))
  process.exit(1)
}

async function api(path) {
  const res = await fetch(`${API}${path}`, { headers: { Accept: "application/json" } })
  if (!res.ok) throw new Error(`Tailcoat ${res.status} for ${path}`)
  return res.json()
}

function loadLedger() {
  try {
    return JSON.parse(readFileSync(LEDGER, "utf8"))
  } catch {
    return { follows: {}, copies: [] }
  }
}
function saveLedger(l) {
  mkdirSync(dirname(LEDGER), { recursive: true })
  writeFileSync(LEDGER, JSON.stringify(l, null, 2))
}
const today = () => new Date().toISOString().slice(0, 10)
const spentToday = (l) => l.copies.filter((c) => c.at.slice(0, 10) === today()).reduce((a, c) => a + Number(c.usd || 0), 0)

try {
  if (cmd === "health") {
    const h = await api("/api/health")
    out({ ok: h.ok, stale: h.stale, jobs: h.jobs, api: API })
  } else if (cmd === "people") {
    out(await api("/api/leaders"))
  } else if (cmd === "feed") {
    const limit = Number(flags.limit ?? 10)
    const data = flags.person ? (await api(`/api/source/${encodeURIComponent(flags.person)}`)).filings : await api("/api/feed")
    out((Array.isArray(data) ? data : []).slice(0, limit))
  } else if (cmd === "follow") {
    if (!flags.person || !flags["per-trade"]) die("follow needs --person <slug> --per-trade <usd>")
    const per = Number(flags["per-trade"])
    if (!(per >= 1 && per <= 1000)) die("per-trade must be between 1 and 1000 USD")
    const l = loadLedger()
    l.follows[flags.person] = { perTradeUsd: per, dailyCapUsd: flags["daily-cap"] ? Number(flags["daily-cap"]) : null, since: new Date().toISOString() }
    saveLedger(l)
    out({ followed: flags.person, ...l.follows[flags.person], ledger: LEDGER })
  } else if (cmd === "unfollow") {
    const l = loadLedger()
    delete l.follows[flags.person]
    saveLedger(l)
    out({ unfollowed: flags.person })
  } else if (cmd === "pending") {
    const l = loadLedger()
    const slugs = Object.keys(l.follows)
    const copied = new Set(l.copies.map((c) => c.tradeId))
    const rows = []
    for (const slug of slugs) {
      const f = l.follows[slug]
      const { filings } = await api(`/api/source/${encodeURIComponent(slug)}`)
      for (const filing of filings ?? []) {
        if (filing.filedAt < f.since) continue
        for (const t of filing.trades ?? []) {
          if (t.side !== "buy" || !t.token || copied.has(t.id)) continue
          const cap = f.dailyCapUsd ? Math.max(0, f.dailyCapUsd - spentToday(l)) : f.perTradeUsd
          rows.push({
            tradeId: t.id,
            person: filing.source.name,
            slug,
            docId: filing.docId,
            url: filing.url,
            receiptTx: filing.receiptTx,
            ticker: t.ticker,
            assetName: t.assetName,
            side: t.side,
            amountLow: t.amountLow,
            amountHigh: t.amountHigh,
            tradedAt: t.tradedAt,
            disclosedAt: t.disclosedAt,
            lagDays: Math.round((Date.parse(t.disclosedAt) - Date.parse(t.tradedAt)) / 86_400_000),
            refPrice: t.pxNow,
            perTradeUsd: Math.min(f.perTradeUsd, cap),
            fromToken: USDT,
            token: t.token,
            quoteCommand: `baw market-order quote --fromTokenQty ${Math.min(f.perTradeUsd, cap)} --fromToken ${USDT} --toToken ${t.token.address} --binanceChainId 56 --json`,
          })
        }
      }
    }
    out(rows)
  } else if (cmd === "record") {
    for (const k of ["trade", "order", "tx", "usd", "tokens"]) if (flags[k] === undefined) die(`record needs --${k}`)
    const l = loadLedger()
    if (l.copies.some((c) => c.tradeId === Number(flags.trade))) die("that trade is already in the ledger")
    l.copies.push({ tradeId: Number(flags.trade), orderId: String(flags.order), txHash: String(flags.tx), usd: Number(flags.usd), tokens: Number(flags.tokens), at: new Date().toISOString() })
    saveLedger(l)
    out({ recorded: Number(flags.trade), copies: l.copies.length, spentToday: spentToday(l) })
  } else if (cmd === "ledger") {
    const l = loadLedger()
    out({ ...l, spentToday: spentToday(l), ledger: LEDGER })
  } else {
    die("commands: health, people, feed, follow, pending, record, ledger, unfollow")
  }
} catch (err) {
  die(err instanceof Error ? err.message : String(err))
}
