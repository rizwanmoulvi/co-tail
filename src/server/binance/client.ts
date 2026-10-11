/**
 * The signed Binance Web3 API, through the official SDK (@binance-web3/wallet). One client per
 * process. Every call is timed and every failure is kept as an incident with its input.
 * Nothing here is required to run: `hasKey()` is false without credentials and callers fall back.
 */
import { Web3Wallet, type Web3WalletRestAPI } from "@binance-web3/wallet"
import { incident } from "../record"

export const BSC = "56"

let client: Web3Wallet | null = null

export function hasKey() {
  return Boolean(process.env.BINANCE_WEB3_API_KEY && process.env.BINANCE_WEB3_API_SECRET)
}

function sdk() {
  if (!hasKey()) throw new Error("BINANCE_WEB3_API_KEY and BINANCE_WEB3_API_SECRET are not set")
  client ??= new Web3Wallet({
    configurationRestAPI: {
      apiKey: process.env.BINANCE_WEB3_API_KEY!,
      apiSecret: process.env.BINANCE_WEB3_API_SECRET!,
      timeout: 15_000,
      retries: 1,
    },
  })
  return client.restAPI
}

type Envelope<T> = { code?: number; msg?: string; data?: T; success?: boolean }

/** Unwraps the OCResult envelope, turning business errors (HTTP 200, code != 0) into exceptions. */
async function call<T>(area: string, input: unknown, fn: () => Promise<{ data: () => Promise<Envelope<T>> }>): Promise<T> {
  const started = Date.now()
  try {
    const res = await fn()
    const body = await res.data()
    if (body.code !== undefined && body.code !== 0) throw new Error(`Binance ${body.code}: ${body.msg ?? "error"}`)
    stats.record(area, Date.now() - started, true)
    return body.data as T
  } catch (err) {
    stats.record(area, Date.now() - started, false)
    await incident(`binance:${area}`, input, err)
    throw err
  }
}

/** In-process counters per endpoint, read by the health route. */
export const stats = {
  calls: new Map<string, { n: number; failed: number; ms: number }>(),
  record(area: string, ms: number, ok: boolean) {
    const s = this.calls.get(area) ?? { n: 0, failed: 0, ms: 0 }
    s.n++
    s.ms += ms
    if (!ok) s.failed++
    this.calls.set(area, s)
  },
  snapshot() {
    return Object.fromEntries([...this.calls].map(([k, v]) => [k, { ...v, avgMs: Math.round(v.ms / Math.max(1, v.n)) }]))
  },
}

// ------------------------------------------------------------------ RWA Data API

export type RwaToken = NonNullable<Web3WalletRestAPI.GetRwaTokenListResponse["data"]>[number]

export function rwaTokens(platformId?: "ondo" | "bstock") {
  const req = { binanceChainId: BSC, ...(platformId ? { platformId: platformId as Web3WalletRestAPI.GetRwaTokenListPlatformIdEnum } : {}) }
  return call<RwaToken[]>("rwa.tokens", req, () => sdk().getRwaTokenList(req))
}

export type RwaPrice = NonNullable<Web3WalletRestAPI.GetRwaTokenPriceResponse["data"]>[number]

/** Token price and the underlying's reference price, up to 100 addresses per call. */
export function rwaPrices(addresses: string[]) {
  const req = { binanceChainId: BSC, tokenContractAddresses: addresses.join(",") }
  return call<RwaPrice[]>("rwa.price", req, () => sdk().getRwaTokenPrice(req))
}

export function rwaSearch(keyword: string) {
  const req = { keyword }
  return call<Web3WalletRestAPI.SearchRwaTokenResponse["data"]>("rwa.search", req, () => sdk().searchRwaToken(req))
}

export function rwaUnderlying(tokenContractAddress: string) {
  const req = { binanceChainId: BSC, tokenContractAddress }
  return call<Web3WalletRestAPI.GetRwaUnderlyingInfoResponse["data"]>("rwa.underlying", req, () => sdk().getRwaUnderlyingInfo(req))
}

export function rwaUnderlyingMarket(tokenContractAddress: string) {
  const req = { binanceChainId: BSC, tokenContractAddress }
  return call<Web3WalletRestAPI.GetRwaUnderlyingMarketDataResponse["data"]>("rwa.underlyingMarket", req, () =>
    sdk().getRwaUnderlyingMarketData(req),
  )
}

// ------------------------------------------------------------------ Trading API

export type QuoteRoute = NonNullable<Web3WalletRestAPI.GetAggregatedQuoteResponse["data"]>[number]

/** Every vendor's quote for a pair, best first. `userWalletAddress` is the account that will send the swap. */
export function quote(params: { from: string; to: string; amountRaw: bigint; userWalletAddress: string }) {
  const req = {
    binanceChainId: BSC,
    amount: params.amountRaw.toString(),
    fromTokenAddress: params.from,
    toTokenAddress: params.to,
    userWalletAddress: params.userWalletAddress,
  }
  return call<QuoteRoute[]>("trading.quote", req, () => sdk().getAggregatedQuote(req))
}

export type SwapBuild = Web3WalletRestAPI.BuildSwapTransactionResponse["data"]

/** Calldata for a quoted SWAP route (or EIP-712 typed data for an RFQ route). Quotes live about 30 s. */
export function buildSwap(params: { from: string; to: string; amountRaw: bigint; userWalletAddress: string; quoteId: string; slippagePercent: string }) {
  const req = {
    binanceChainId: BSC,
    amount: params.amountRaw.toString(),
    fromTokenAddress: params.from,
    toTokenAddress: params.to,
    userWalletAddress: params.userWalletAddress,
    quoteId: params.quoteId,
    slippagePercent: params.slippagePercent,
    priceImpactProtectionPercent: "5",
  }
  return call<SwapBuild>("trading.swap", req, () => sdk().buildSwapTransaction(req))
}

export function approveCalldata(tokenContractAddress: string, approveAmountRaw: bigint, vendor?: string) {
  const req = { binanceChainId: BSC, tokenContractAddress, approveAmount: approveAmountRaw.toString(), ...(vendor ? { vendor } : {}) }
  return call<Web3WalletRestAPI.GetErc20ApproveTransactionResponse["data"]>("trading.approve", req, () => sdk().getErc20ApproveTransaction(req))
}

// ------------------------------------------------------------------ Transaction API

export type Simulation = NonNullable<Web3WalletRestAPI.SimulateTransactionsResponse["data"]>

/** Off-chain execution of an EVM call: predicted status, balance and allowance changes. */
export function simulate(tx: { from: string; to: string; data: string; value?: string }) {
  const req = { binanceChainId: BSC, evmTx: { from: tx.from, to: tx.to, value: tx.value ?? "0", data: tx.data } } as unknown as Web3WalletRestAPI.SimulateTransactionsRequest
  return call<Simulation>("tx.simulate", req, () => sdk().simulateTransactions(req))
}

export function gasPrice() {
  const req = { binanceChainId: BSC }
  return call<Web3WalletRestAPI.GetGasPriceResponse["data"]>("tx.gasPrice", req, () => sdk().getGasPrice(req))
}

/** Broadcasts a signed raw transaction through Binance (with its KYT checks) and returns the hash. */
export function broadcast(signedTransaction: `0x${string}`, address: string) {
  const req = { binanceChainId: BSC, signedTransaction, address, enableMevProtection: true }
  return call<{ orderId?: string; txHash?: string }>("tx.broadcast", { ...req, signedTransaction: `${signedTransaction.slice(0, 20)}…` }, () =>
    sdk().broadcastTransactions(req),
  )
}

export function txDetail(txHash: string) {
  const req = { binanceChainId: BSC, txHash }
  return call<Web3WalletRestAPI.GetTransactionDetailByHashResponse["data"]>("wallet.txDetail", req, () => sdk().getTransactionDetailByHash(req))
}

// ------------------------------------------------------------------ Wallet API

export function balances(address: string) {
  const req = { address, binanceChainId: BSC, pageSize: 100 } as unknown as Web3WalletRestAPI.GetAllTokenBalancesByAddressRequest
  return call<Web3WalletRestAPI.GetAllTokenBalancesByAddressResponse["data"]>("wallet.balances", req, () => sdk().getAllTokenBalancesByAddress(req))
}
