/**
 * End to end on a chain: a follower approves cash and sets caps, the operator writes a receipt,
 * mirrors a $10 buy of NVDAB into the follower's wallet, then sells half of it back.
 *
 * Against a local Anvil fork of BSC (no real money):
 *   anvil --fork-url https://bsc-dataseed.binance.org --port 8547 &
 *   BSC_RPC_URL=http://127.0.0.1:8547 npx tsx --env-file=.env scripts/e2e.ts --anvil
 * Against mainnet, with funded keys and NEXT_PUBLIC_MIRROR_ADDRESS set:
 *   npx tsx --env-file=.env scripts/e2e.ts
 */
import { readFile } from "node:fs/promises"
import { createWalletClient, erc20Abi, formatUnits, http, parseEther, parseUnits, type Address, type Hex } from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { bsc } from "viem/chains"
import { PLATFORM, rwaList } from "../src/server/binance/public"
import { CASH_DECIMALS, PCS_V3_ROUTER, USDT, followerCash, followerStock, mirrorAddress, mirrorBuy, mirrorSell, operator, publicClient, rpcUrl, writeReceipt } from "../src/server/bsc/executor"
import { mirrorAbi } from "../src/server/bsc/mirror-abi"
import { livePriceOf } from "../src/server/prices"
import { buildRegistry, tokenBySymbol, useRegistry } from "../src/server/registry"

const anvil = process.argv.includes("--anvil")
const log = (...a: unknown[]) => console.log(new Date().toISOString(), ...a)

async function keyFrom(file: string) {
  const raw = JSON.parse(await readFile(file, "utf8")) as { private_key: string }[] | { private_key: string }
  return privateKeyToAccount((Array.isArray(raw) ? raw[0] : raw).private_key as Hex)
}

const op = await operator()
const follower = await keyFrom(process.env.FOLLOWER_KEYFILE || "keys/follower-burner.json")
const followerWallet = createWalletClient({ account: follower, chain: bsc, transport: http(rpcUrl) })
const opWallet = createWalletClient({ account: op, chain: bsc, transport: http(rpcUrl) })

const reg = buildRegistry(await rwaList(PLATFORM.bstock))
useRegistry(reg)
const nvdab = tokenBySymbol(reg, "NVDAB")!
log("registry: NVDAB", nvdab.address, "multiplier", nvdab.multiplier)

if (anvil) {
  // Give the actors BNB and the follower 100 USDT from a Binance hot wallet, on the fork only.
  const rpc = async (method: string, params: unknown[]) => fetch(rpcUrl, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) }).then((r) => r.json())
  await rpc("anvil_setBalance", [op.address, `0x${parseEther("1").toString(16)}`])
  await rpc("anvil_setBalance", [follower.address, `0x${parseEther("1").toString(16)}`])
  const whale: Address = "0xF977814e90dA44bFA03b6295A0616a897441aceC"
  await rpc("anvil_setBalance", [whale, `0x${parseEther("1").toString(16)}`])
  await rpc("anvil_impersonateAccount", [whale])
  const whaleClient = createWalletClient({ account: whale, chain: bsc, transport: http(rpcUrl) })
  const h = await whaleClient.writeContract({ address: USDT, abi: erc20Abi, functionName: "transfer", args: [follower.address, parseUnits("100", 18)] })
  await publicClient.waitForTransactionReceipt({ hash: h })
  await rpc("anvil_stopImpersonatingAccount", [whale])
  log("anvil: funded operator, follower (100 USDT)")
}

const mirror = mirrorAddress()
const allowed = await publicClient.readContract({ address: mirror, abi: mirrorAbi, functionName: "allowedStock", args: [nvdab.address] })
if (!allowed) {
  log("allowlisting NVDAB and the PancakeSwap router on the mirror (owner call)")
  const h1 = await opWallet.writeContract({ address: mirror, abi: mirrorAbi, functionName: "setStocks", args: [[nvdab.address], true] })
  await publicClient.waitForTransactionReceipt({ hash: h1 })
  const h2 = await opWallet.writeContract({ address: mirror, abi: mirrorAbi, functionName: "setRouters", args: [[PCS_V3_ROUTER], true] })
  await publicClient.waitForTransactionReceipt({ hash: h2 })
}

// 1. Follow: approve 50 USDT to the mirror, cap at 20 per trade and 50 a day.
const a1 = await followerWallet.writeContract({ address: USDT, abi: erc20Abi, functionName: "approve", args: [mirror, parseUnits("50", CASH_DECIMALS)] })
await publicClient.waitForTransactionReceipt({ hash: a1 })
const a2 = await followerWallet.writeContract({ address: mirror, abi: mirrorAbi, functionName: "setLimits", args: [parseUnits("20", 18), parseUnits("50", 18)] })
await publicClient.waitForTransactionReceipt({ hash: a2 })
const cash = await followerCash(follower.address)
log("follow:", cash)
if (cash.spendable < 10) throw new Error("follower cannot spend 10 USDT; fund the burner")

// 2. Receipt for a (made-up here) filing hash.
const sha = "ab".repeat(32)
const rtx = await writeReceipt(sha, "house_ptr:e2e", 1, 1)
log("receipt tx:", rtx)

// 3. Mirror a $10 buy. The reference is the live Binance price per share.
const quote = await livePriceOf(nvdab)
log("reference price per share:", quote.price.toFixed(2), "status", quote.status.reasonCode)
const before = await followerStock(follower.address, nvdab)
const buy = await mirrorBuy({ follower: follower.address, token: nvdab, usd: 10, refPrice: quote.price, filingSha256: sha })
log("buy:", buy)
const after = await followerStock(follower.address, nvdab)
const got = after.tokens - before.tokens
if (got <= 0) throw new Error("follower received no NVDAB")
log(`follower received ${got} NVDAB (${(got * nvdab.multiplier).toFixed(5)} shares) at $${(10 / (got * nvdab.multiplier)).toFixed(2)}/share, route ${buy.route}, simulated by ${buy.simulatedBy}, sent via ${buy.sentVia}`)
const mirrorHoldsStock = await publicClient.readContract({ address: nvdab.address, abi: erc20Abi, functionName: "balanceOf", args: [mirror] })
const mirrorHoldsCash = await publicClient.readContract({ address: USDT, abi: erc20Abi, functionName: "balanceOf", args: [mirror] })
if (mirrorHoldsStock !== 0n || mirrorHoldsCash !== 0n) throw new Error("the mirror kept tokens")

// 4. Allow selling, then sell half back to USDT.
const s1 = await followerWallet.writeContract({ address: nvdab.address, abi: erc20Abi, functionName: "approve", args: [mirror, 2n ** 256n - 1n] })
await publicClient.waitForTransactionReceipt({ hash: s1 })
const sell = await mirrorSell({ follower: follower.address, token: nvdab, tokens: got / 2, refPrice: quote.price, filingSha256: sha })
log("sell:", sell)
const cashAfter = await followerCash(follower.address)
log(`follower USDT balance now ${cashAfter.balance.toFixed(4)}; spendable today ${cashAfter.spendable}`)
log("e2e ok", { buy: buy.hash, sell: sell.hash, nvdabHeld: formatUnits(await publicClient.readContract({ address: nvdab.address, abi: erc20Abi, functionName: "balanceOf", args: [follower.address] }), 18) })
