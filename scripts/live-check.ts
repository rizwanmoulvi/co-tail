/**
 * Runs once the Binance Web3 API key is set: exercises every signed call the executor relies on,
 * without sending anything, and prints the facts for docs/INTEGRATIONS.md and the DX report.
 *   npx tsx --env-file=.env scripts/live-check.ts
 */
import { formatUnits, parseUnits } from "viem"
import * as binance from "../src/server/binance/client"
import { b402Supported } from "../src/server/binance/b402"
import { PCS_V3_ROUTER, USDT, pancakeRoute } from "../src/server/bsc/executor"
import { PLATFORM, rwaList } from "../src/server/binance/public"
import { buildRegistry, tokenBySymbol, useRegistry } from "../src/server/registry"

const log = (...a: unknown[]) => console.log(new Date().toISOString(), ...a)
const t = async <T>(name: string, fn: () => Promise<T>) => {
  const started = Date.now()
  try {
    const r = await fn()
    log(`ok   ${name} (${Date.now() - started} ms)`)
    return r
  } catch (err) {
    log(`FAIL ${name} (${Date.now() - started} ms): ${err instanceof Error ? err.message : err}`)
    return null
  }
}

if (!binance.hasKey()) throw new Error("BINANCE_WEB3_API_KEY and BINANCE_WEB3_API_SECRET are not set")
useRegistry(buildRegistry(await rwaList(PLATFORM.bstock)))
const reg = buildRegistry(await rwaList(PLATFORM.bstock))
const nvdab = tokenBySymbol(reg, "NVDAB")!
const wallet = (process.env.NEXT_PUBLIC_MIRROR_ADDRESS || "0xDAe725EF7e04F290974468A471b0375aD1A6D8b1") as `0x${string}`
const amount = parseUnits("5", 18)

// RWA Data API
const tokens = await t("rwa.tokens(bstock)", () => binance.rwaTokens("bstock"))
if (tokens) log(`  ${tokens.length} bStocks; first: ${tokens[0]?.tokenSymbol} ratio ${tokens[0]?.tokenToShareRatio} status ${tokens[0]?.statusInfo?.marketStatus}`)
const prices = await t("rwa.price(NVDAB)", () => binance.rwaPrices([nvdab.address]))
if (prices) log(`  tokenPrice ${prices[0]?.tokenPrice} referencePrice ${prices[0]?.referencePrice}`)
await t("rwa.search(NVDA)", async () => (await binance.rwaSearch("NVDA"))?.length)
const um = await t("rwa.underlyingMarket(NVDAB)", () => binance.rwaUnderlyingMarket(nvdab.address))
if (um) log(`  ${JSON.stringify(um.statusInfo)} ref ${um.marketData?.referencePrice}`)

// Trading API: quote with the mirror (or operator) as the wallet, then calldata
const routes = await t("trading.quote(5 USDT -> NVDAB)", () => binance.quote({ from: USDT, to: nvdab.address, amountRaw: amount, userWalletAddress: wallet }))
if (routes) {
  for (const r of routes) log(`  ${r.vendorName} ${r.executionMode} out ${formatUnits(BigInt(r.toTokenAmount ?? "0"), 18)} impact ${r.priceImpactPercent} approveTarget ${r.approveTarget} router ${r.router?.slice(0, 60)}`)
  const swap = routes.find((r) => r.executionMode === "SWAP" && r.quoteId)
  if (swap) {
    const built = await t(`trading.swap(${swap.vendorName})`, () => binance.buildSwap({ from: USDT, to: nvdab.address, amountRaw: amount, userWalletAddress: wallet, quoteId: swap.quoteId!, slippagePercent: "1" }))
    if (built?.tx) log(`  tx.to ${built.tx.to} data ${String(built.tx.data).length / 2 - 1} bytes gas ${built.tx.gas} minReceive ${built.tx.minReceiveAmount}  <- allowlist tx.to and approveTarget on the mirror`)
  } else log("  no SWAP route; RFQ only for this pair")
}

// PancakeSwap fallback for comparison
const pcs = await t("pancake quote (5 USDT -> NVDAB)", () => pancakeRoute(USDT, nvdab.address, amount))
if (pcs) log(`  ${pcs.label} out ${formatUnits(pcs.expectedOut, 18)} router ${PCS_V3_ROUTER}`)

// Transaction API: simulate a plain USDT approve from the operator (no send)
const approveData = `0x095ea7b3${wallet.slice(2).padStart(64, "0")}${amount.toString(16).padStart(64, "0")}` as `0x${string}`
const sim = await t("tx.simulate(approve)", () => binance.simulate({ from: wallet, to: USDT, data: approveData }))
if (sim) log(`  status ${sim.status} failReason ${sim.failReason} allowanceChanges ${sim.allowanceChanges?.length}`)
await t("tx.gasPrice", async () => JSON.stringify((await binance.gasPrice())?.evmLegacyGasPrice))

// Wallet API
const bal = await t("wallet.balances(operator)", () => binance.balances(wallet))
if (bal) log(`  ${JSON.stringify(bal).slice(0, 200)}`)

// b402
const accepts = await t("b402.supported", () => b402Supported(0.01, wallet))
if (accepts) log(`  ${accepts.map((a) => `${a.asset.slice(0, 8)} ${a.extra.assetTransferMethod}`).join(", ") || "no BSC kinds (merchant not onboarded?)"}`)

log("done; counters:", JSON.stringify(binance.stats.snapshot()))
