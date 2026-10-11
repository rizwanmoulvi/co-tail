/**
 * Binance's b402 facilitator (x402 v2) through the signed Web3 API. The merchant is the project
 * that owns the API key. Verify is off-chain; settle moves funds and is irreversible.
 * Request bodies are wrapped as {"body": {...}} per the b402 docs.
 */
import { createHmac } from "node:crypto"
import { incident } from "../record"

const BASE = "https://web3.binance.com/build"

export type Accept = {
  scheme: "exact"
  network: "eip155:56"
  asset: string
  amount: string
  payTo: string
  maxTimeoutSeconds: number
  extra: Record<string, unknown>
}

/** The four stablecoins the facilitator settles on BSC, all 18 decimals. */
const ASSETS: Record<string, { address: string; name: string }> = {
  U: { address: "0xcE24439F2D9C6a2289F741120FE202248B666666", name: "U" },
  USD1: { address: "0x8d0D000Ee44948FC98c9B98A4FA4921476f08B0d", name: "USD1" },
  USDT: { address: "0x55d398326f99059fF775485246999027B3197955", name: "Tether USD" },
  USDC: { address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", name: "USD Coin" },
}

function sign(method: string, path: string, body: string) {
  const key = process.env.BINANCE_WEB3_API_KEY
  const secret = process.env.BINANCE_WEB3_API_SECRET
  if (!key || !secret) throw new Error("BINANCE_WEB3_API_KEY and BINANCE_WEB3_API_SECRET are not set")
  const timestamp = new Date().toISOString()
  // Pre-hash includes the /build prefix of the request path, per the authentication docs.
  const preHash = `${timestamp}${method}/build${path}${body}`
  const signature = createHmac("sha256", secret).update(preHash, "utf8").digest("base64")
  return { "X-OC-APIKEY": key, "X-OC-TIMESTAMP": timestamp, "X-OC-SIGN": signature, "Content-Type": "application/json" }
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const raw = JSON.stringify({ body })
  const res = await fetch(`${BASE}${path}`, { method: "POST", headers: sign("POST", path, raw), body: raw })
  const json = (await res.json().catch(() => ({}))) as { code?: string | number; status?: string; data?: T; msg?: string; errorData?: unknown }
  if (!res.ok || !(json.code === "000000000" || json.code === 0 || json.status === "OK")) {
    const err = new Error(`b402 ${path} ${res.status} code ${json.code}: ${json.msg ?? JSON.stringify(json.errorData ?? "")}`)
    await incident(`binance:b402${path.replace("/api/v2/b402", "")}`, body, err)
    throw err
  }
  return json.data as T
}

type Supported = {
  kinds: { x402Version: number; scheme: string; network: string; extra: { name?: string; version?: string; assetTransferMethod: string; signerAddress: string; spenderAddress?: string } }[]
}

let cached: { at: number; kinds: Supported["kinds"] } | null = null

/** The accepts we offer: every stablecoin the facilitator lists for BSC, priced at `usd`. */
export async function b402Supported(usd: number, payTo: string): Promise<Accept[]> {
  if (!cached || Date.now() - cached.at > 10 * 60_000) {
    const s = await post<Supported>("/api/v2/b402/supported", {})
    cached = { at: Date.now(), kinds: s.kinds ?? [] }
  }
  const amount = BigInt(Math.round(usd * 1e6)) * 10n ** 12n
  const out: Accept[] = []
  for (const kind of cached.kinds) {
    if (kind.network !== "eip155:56") continue
    const name = kind.extra?.name
    const asset = Object.values(ASSETS).find((a) => a.name === name) ?? (name && ASSETS[name])
    if (!asset) continue
    out.push({ scheme: "exact", network: "eip155:56", asset: asset.address, amount: amount.toString(), payTo, maxTimeoutSeconds: 300, extra: kind.extra })
  }
  return out
}

export function b402Verify(body: { paymentPayload: unknown; paymentRequirements: Accept }) {
  return post<{ isValid: boolean; payer?: string; invalidReason?: string | null }>("/api/v2/b402/verify", { x402Version: 2, ...body })
}

export function b402Settle(body: { paymentPayload: unknown; paymentRequirements: Accept }) {
  return post<{ success: boolean; transaction?: string; payer?: string; network?: string; amount?: string; errorReason?: string | null }>("/api/v2/b402/settle", {
    x402Version: 2,
    ...body,
  })
}
