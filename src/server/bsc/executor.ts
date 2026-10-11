/**
 * Mirrors on BSC through the TailcoatMirror contract. The operator key only ever calls the mirror,
 * which pulls the follower's approved cash, swaps it through an allowed router and hands the stock
 * to the follower in the same transaction.
 *
 * Route: the Binance Trading API builds the swap (quote, then calldata with the mirror as the
 * wallet) when a key is set and the pair has a SWAP route; otherwise PancakeSwap V3 directly.
 * Gate: every transaction is simulated through the Binance Transaction API before it is signed;
 * if that API is unreachable the RPC's eth_call stands in and the execution says so.
 * Send: signed locally, broadcast through the Transaction API (MEV-protected), RPC as fallback.
 */
import { readFile } from "node:fs/promises"
import {
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  encodeFunctionData,
  erc20Abi,
  formatUnits,
  http,
  parseUnits,
  type Address,
  type Hex,
} from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { bsc } from "viem/chains"
import * as binance from "../binance/client"
import { incident } from "../record"
import type { StockToken } from "../registry"
import { mirrorAbi } from "./mirror-abi"

export const USDT: Address = (process.env.CASH_TOKEN as Address) ?? "0x55d398326f99059fF775485246999027B3197955"
export const CASH_DECIMALS = 18
/** PancakeSwap V3 SwapRouter and QuoterV2 on BSC. */
export const PCS_V3_ROUTER: Address = "0x1b81D678ffb9C0263b24A97847620C99d213eB14"
export const PCS_V3_QUOTER: Address = "0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997"
const PCS_FEES = [2500, 500, 10000, 100] as const

const MAX_DEVIATION = Number(process.env.MAX_PRICE_DEVIATION || 0.03)
const SLIPPAGE_PERCENT = process.env.SLIPPAGE_PERCENT || "1"

export const rpcUrl = process.env.BSC_RPC_URL || "https://bsc-dataseed.binance.org"
export const publicClient = createPublicClient({ chain: bsc, transport: http(rpcUrl) })

export function mirrorAddress(): Address {
  const a = process.env.NEXT_PUBLIC_MIRROR_ADDRESS
  if (!a) throw new Error("NEXT_PUBLIC_MIRROR_ADDRESS is not set; deploy the contract first (scripts/deploy.sh)")
  return a as Address
}

let operatorAccount: ReturnType<typeof privateKeyToAccount> | null = null

/** The operator key: OPERATOR_PRIVATE_KEY (Vercel) or OPERATOR_KEYFILE (cast wallet new --json format). */
export async function operator() {
  if (operatorAccount) return operatorAccount
  let key = process.env.OPERATOR_PRIVATE_KEY as Hex | undefined
  if (!key) {
    const file = process.env.OPERATOR_KEYFILE || "keys/operator.json"
    const raw = JSON.parse(await readFile(file, "utf8")) as { private_key: string }[] | { private_key: string }
    key = (Array.isArray(raw) ? raw[0] : raw).private_key as Hex
  }
  operatorAccount = privateKeyToAccount(key)
  return operatorAccount
}

const quoterAbi = [
  {
    type: "function",
    name: "quoteExactInputSingle",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "fee", type: "uint24" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
      },
    ],
    outputs: [
      { name: "amountOut", type: "uint256" },
      { name: "sqrtPriceX96After", type: "uint160" },
      { name: "initializedTicksCrossed", type: "uint32" },
      { name: "gasEstimate", type: "uint256" },
    ],
  },
] as const

const pcsRouterAbi = [
  {
    type: "function",
    name: "exactInputSingle",
    stateMutability: "payable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "fee", type: "uint24" },
          { name: "recipient", type: "address" },
          { name: "deadline", type: "uint256" },
          { name: "amountIn", type: "uint256" },
          { name: "amountOutMinimum", type: "uint256" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
      },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }],
  },
] as const

export type Route = {
  router: Address
  spender: Address
  data: Hex
  /** What the route expects to deliver, raw units of tokenOut. */
  expectedOut: bigint
  /** The minimum the mirror will accept, raw units of tokenOut. */
  minOut: bigint
  label: string
}

/** Best PancakeSwap V3 single-hop route by on-chain quote across the fee tiers. */
export async function pancakeRoute(tokenIn: Address, tokenOut: Address, amountIn: bigint): Promise<Route> {
  const quotes = await Promise.all(
    PCS_FEES.map(async (fee) => {
      try {
        const { result } = await publicClient.simulateContract({
          address: PCS_V3_QUOTER,
          abi: quoterAbi,
          functionName: "quoteExactInputSingle",
          args: [{ tokenIn, tokenOut, amountIn, fee, sqrtPriceLimitX96: 0n }],
        })
        return { fee, out: result[0] }
      } catch {
        return { fee, out: 0n }
      }
    }),
  )
  const best = quotes.sort((a, b) => (a.out > b.out ? -1 : 1))[0]
  if (!best || best.out === 0n) throw new Error("No PancakeSwap V3 pool with liquidity for this pair")
  const minOut = (best.out * BigInt(Math.round((100 - Number(SLIPPAGE_PERCENT)) * 100))) / 10_000n
  const data = encodeFunctionData({
    abi: pcsRouterAbi,
    functionName: "exactInputSingle",
    args: [
      {
        tokenIn,
        tokenOut,
        fee: best.fee,
        recipient: mirrorAddress(),
        deadline: BigInt(Math.floor(Date.now() / 1000) + 600),
        amountIn,
        amountOutMinimum: minOut,
        sqrtPriceLimitX96: 0n,
      },
    ],
  })
  return { router: PCS_V3_ROUTER, spender: PCS_V3_ROUTER, data, expectedOut: best.out, minOut, label: `pancake:v3:${best.fee}` }
}

/**
 * A route from the Binance aggregator: the best SWAP-mode vendor's calldata, built with the mirror
 * as the sending wallet. Returns null when there is no key, no SWAP route (RFQ only), or the call fails,
 * so the caller can fall back.
 */
export async function binanceRoute(tokenIn: Address, tokenOut: Address, amountIn: bigint): Promise<Route | null> {
  if (!binance.hasKey()) return null
  try {
    const mirror = mirrorAddress()
    const routes = await binance.quote({ from: tokenIn, to: tokenOut, amountRaw: amountIn, userWalletAddress: mirror })
    const swap = routes.filter((r) => r.executionMode === "SWAP" && r.quoteId).sort((a, b) => Number(b.toTokenAmount) - Number(a.toTokenAmount))[0]
    if (!swap) return null
    const built = await binance.buildSwap({
      from: tokenIn,
      to: tokenOut,
      amountRaw: amountIn,
      userWalletAddress: mirror,
      quoteId: swap.quoteId!,
      slippagePercent: SLIPPAGE_PERCENT,
    })
    const tx = built?.tx
    if (built?.executionMode !== "SWAP" || !tx?.to || !tx.data) return null
    const expectedOut = BigInt(built.routerResult?.toTokenAmount ?? swap.toTokenAmount ?? "0")
    const minOut = BigInt(tx.minReceiveAmount ?? "0") || (expectedOut * BigInt(Math.round((100 - Number(SLIPPAGE_PERCENT)) * 100))) / 10_000n
    const spender = (swap.approveTarget ?? tx.to) as Address
    return { router: tx.to as Address, spender, data: tx.data as Hex, expectedOut, minOut, label: `binance:${swap.vendorName ?? "swap"}` }
  } catch (err) {
    await incident("executor:binanceRoute", { tokenIn, tokenOut, amountIn }, err)
    return null
  }
}

export async function bestRoute(tokenIn: Address, tokenOut: Address, amountIn: bigint) {
  return (await binanceRoute(tokenIn, tokenOut, amountIn)) ?? pancakeRoute(tokenIn, tokenOut, amountIn)
}

export type Gate = { by: "binance" | "rpc"; ok: boolean; reason?: string }

/** Runs the transaction off-chain first. Binance's simulation when available, the RPC otherwise. */
export async function gate(tx: { from: Address; to: Address; data: Hex }): Promise<Gate> {
  if (binance.hasKey()) {
    try {
      const sim = await binance.simulate({ from: tx.from, to: tx.to, data: tx.data })
      const ok = String(sim.status).toUpperCase() === "SUCCESS"
      return { by: "binance", ok, reason: ok ? undefined : (sim.failReason ?? `simulation ${sim.status}`) }
    } catch {
      /* recorded as an incident by the client; fall through to the RPC */
    }
  }
  try {
    await publicClient.call({ account: tx.from, to: tx.to, data: tx.data })
    return { by: "rpc", ok: true }
  } catch (err) {
    const e = err as { shortMessage?: string; details?: string; message?: string }
    const reason = [e.shortMessage, e.details].filter(Boolean).join(": ") || (err instanceof Error ? err.message.split("\n")[0] : String(err))
    return { by: "rpc", ok: false, reason }
  }
}

/** Signs with the operator key and broadcasts: Binance Transaction API first, RPC as fallback. */
export async function send(tx: { to: Address; data: Hex }): Promise<{ hash: Hex; via: "binance" | "rpc" }> {
  const account = await operator()
  const wallet = createWalletClient({ account, chain: bsc, transport: http(rpcUrl) })
  const gas = await publicClient.estimateGas({ account, to: tx.to, data: tx.data })
  const gasPrice = await publicClient.getGasPrice()
  const nonce = await publicClient.getTransactionCount({ address: account.address, blockTag: "pending" })
  const signed = await wallet.signTransaction({ to: tx.to, data: tx.data, gas: (gas * 12n) / 10n, gasPrice, nonce, type: "legacy" })
  if (binance.hasKey()) {
    try {
      const res = await binance.broadcast(signed, account.address)
      if (res.txHash) return { hash: res.txHash as Hex, via: "binance" }
    } catch {
      /* recorded; fall back to the RPC with the same signed bytes */
    }
  }
  const hash = await publicClient.sendRawTransaction({ serializedTransaction: signed })
  return { hash, via: "rpc" }
}

export async function writeReceipt(sha256Hex: string, docId: string, trades: number, mirrorable: number) {
  const data = encodeFunctionData({
    abi: mirrorAbi,
    functionName: "receipt",
    args: [`0x${sha256Hex.replace(/^0x/, "")}` as Hex, docId, trades, mirrorable],
  })
  const { hash } = await send({ to: mirrorAddress(), data })
  await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 })
  return hash
}

export type MirrorResult = {
  hash: Hex
  cashAmount: number
  tokenAmount: number
  route: string
  simulatedBy: Gate["by"]
  sentVia: "binance" | "rpc"
  quotePx: number
}

function filingKey(sha256Hex: string | null | undefined): Hex {
  return `0x${(sha256Hex ?? "").replace(/^0x/, "").padStart(64, "0").slice(0, 64)}` as Hex
}

/**
 * Buys `usd` of `token` for `follower` and returns what landed. Throws, with a plain reason, when
 * the route's price is too far from the reference, the simulation fails, or the chain reverts.
 */
export async function mirrorBuy(opts: { follower: Address; token: StockToken; usd: number; refPrice: number; filingSha256: string | null }) {
  const amountIn = parseUnits(opts.usd.toFixed(6), CASH_DECIMALS)
  const route = await bestRoute(USDT, opts.token.address, amountIn)
  const shares = Number(formatUnits(route.expectedOut, opts.token.decimals)) * opts.token.multiplier
  const quotePx = opts.usd / shares
  const deviation = Math.abs(quotePx / opts.refPrice - 1)
  if (deviation > MAX_DEVIATION) {
    throw new Error(`Route price $${quotePx.toFixed(2)} is ${(deviation * 100).toFixed(1)}% from the reference $${opts.refPrice.toFixed(2)} (${route.label})`)
  }
  const data = encodeFunctionData({
    abi: mirrorAbi,
    functionName: "mirrorBuy",
    args: [opts.follower, filingKey(opts.filingSha256), opts.token.address, amountIn, route.minOut, route.router, route.spender, route.data],
  })
  const from = (await operator()).address
  const g = await gate({ from, to: mirrorAddress(), data })
  if (!g.ok) throw new Error(`Simulation (${g.by}) refused the mirror: ${g.reason}`)
  const { hash, via } = await send({ to: mirrorAddress(), data })
  const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 })
  if (receipt.status !== "success") throw new Error(`Mirror reverted on-chain: ${hash}`)
  const mirrored = decodeMirrored(receipt.logs)
  return {
    hash,
    cashAmount: Number(formatUnits(mirrored?.cashAmount ?? amountIn, CASH_DECIMALS)),
    tokenAmount: Number(formatUnits(mirrored?.stockAmount ?? route.expectedOut, opts.token.decimals)),
    route: route.label,
    simulatedBy: g.by,
    sentVia: via,
    quotePx,
  } satisfies MirrorResult
}

export async function mirrorSell(opts: { follower: Address; token: StockToken; tokens: number; refPrice: number; filingSha256: string | null }) {
  const amountIn = parseUnits(opts.tokens.toFixed(opts.token.decimals), opts.token.decimals)
  const route = await bestRoute(opts.token.address, USDT, amountIn)
  const usd = Number(formatUnits(route.expectedOut, CASH_DECIMALS))
  const quotePx = usd / (opts.tokens * opts.token.multiplier)
  const deviation = Math.abs(quotePx / opts.refPrice - 1)
  if (deviation > MAX_DEVIATION) {
    throw new Error(`Route price $${quotePx.toFixed(2)} is ${(deviation * 100).toFixed(1)}% from the reference $${opts.refPrice.toFixed(2)} (${route.label})`)
  }
  const data = encodeFunctionData({
    abi: mirrorAbi,
    functionName: "mirrorSell",
    args: [opts.follower, filingKey(opts.filingSha256), opts.token.address, amountIn, route.minOut, route.router, route.spender, route.data],
  })
  const from = (await operator()).address
  const g = await gate({ from, to: mirrorAddress(), data })
  if (!g.ok) throw new Error(`Simulation (${g.by}) refused the sale: ${g.reason}`)
  const { hash, via } = await send({ to: mirrorAddress(), data })
  const receipt = await publicClient.waitForTransactionReceipt({ hash, confirmations: 1 })
  if (receipt.status !== "success") throw new Error(`Sale reverted on-chain: ${hash}`)
  const mirrored = decodeMirrored(receipt.logs)
  return {
    hash,
    cashAmount: Number(formatUnits(mirrored?.cashAmount ?? route.expectedOut, CASH_DECIMALS)),
    tokenAmount: Number(formatUnits(mirrored?.stockAmount ?? amountIn, opts.token.decimals)),
    route: route.label,
    simulatedBy: g.by,
    sentVia: via,
    quotePx,
  } satisfies MirrorResult
}

function decodeMirrored(logs: { data: Hex; topics: [] | [Hex, ...Hex[]]; address: Address }[]) {
  for (const log of logs) {
    try {
      const ev = decodeEventLog({ abi: mirrorAbi, data: log.data, topics: log.topics })
      if (ev.eventName === "Mirrored") return ev.args
    } catch {
      /* another contract's log */
    }
  }
  return null
}

// ------------------------------------------------------------------ reads

/** What the mirror may spend for a follower right now: their cash approval, balance and own caps. */
export async function followerCash(follower: Address) {
  const mirror = mirrorAddress()
  const [allowance, balance, spendable, limits] = await Promise.all([
    publicClient.readContract({ address: USDT, abi: erc20Abi, functionName: "allowance", args: [follower, mirror] }),
    publicClient.readContract({ address: USDT, abi: erc20Abi, functionName: "balanceOf", args: [follower] }),
    publicClient.readContract({ address: mirror, abi: mirrorAbi, functionName: "spendable", args: [follower] }),
    publicClient.readContract({ address: mirror, abi: mirrorAbi, functionName: "limits", args: [follower] }),
  ])
  const f = (v: bigint) => Number(formatUnits(v, CASH_DECIMALS))
  return {
    allowance: f(allowance),
    balance: f(balance),
    spendable: f(spendable),
    maxPerTrade: f(limits[0]),
    dailyCap: f(limits[1]),
    spentToday: f(limits[2]),
    paused: limits[4],
  }
}

/** A follower's holding of a stock and how much of it the mirror may sell. */
export async function followerStock(follower: Address, token: StockToken) {
  const mirror = mirrorAddress()
  const [balance, allowance] = await Promise.all([
    publicClient.readContract({ address: token.address, abi: erc20Abi, functionName: "balanceOf", args: [follower] }),
    publicClient.readContract({ address: token.address, abi: erc20Abi, functionName: "allowance", args: [follower, mirror] }),
  ])
  return { tokens: Number(formatUnits(balance, token.decimals)), sellable: Number(formatUnits(allowance, token.decimals)) }
}

export async function isAllowedStock(token: StockToken) {
  return publicClient.readContract({ address: mirrorAddress(), abi: mirrorAbi, functionName: "allowedStock", args: [token.address] })
}

// ------------------------------------------------------------------ calldata for wallets

/** The two calls a follower signs to follow: approve cash to the mirror, then set their caps. */
export function followCalldata(budgetUsd: number, perTradeUsd: number, dailyCapUsd: number) {
  const mirror = mirrorAddress()
  return {
    approve: { to: USDT, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [mirror, parseUnits(budgetUsd.toFixed(6), CASH_DECIMALS)] }) },
    setLimits: {
      to: mirror,
      data: encodeFunctionData({
        abi: mirrorAbi,
        functionName: "setLimits",
        args: [parseUnits(perTradeUsd.toFixed(6), CASH_DECIMALS), parseUnits(dailyCapUsd.toFixed(6), CASH_DECIMALS)],
      }),
    },
  }
}

export function revokeCalldata() {
  const mirror = mirrorAddress()
  return {
    revoke: { to: USDT, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [mirror, 0n] }) },
    pause: { to: mirror, data: encodeFunctionData({ abi: mirrorAbi, functionName: "setPaused", args: [true] }) },
  }
}

/** Approval that lets exits and disclosed sales sell a follower's stock through the mirror. */
export function allowSellCalldata(token: StockToken) {
  return { to: token.address, data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [mirrorAddress(), 2n ** 256n - 1n] }) }
}
