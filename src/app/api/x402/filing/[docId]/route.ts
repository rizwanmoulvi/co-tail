import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"
import { randomUUID } from "node:crypto"
import { hasKey } from "@/server/binance/client"
import { b402Settle, b402Supported, b402Verify, type Accept } from "@/server/binance/b402"
import { db, schema } from "@/server/db"
import { incident } from "@/server/record"

/**
 * x402 (b402) pay-per-call: one parsed filing for $0.01 in U, USD1, USDT or USDC on BSC.
 *
 * GET without payment answers 402 with a `PAYMENT-REQUIRED` header (x402 v2). The buyer signs one
 * of the `accepts` (for example with `baw x402-payment preview` then `sign`) and replays the request
 * with `PAYMENT-SIGNATURE`. The server verifies through Binance's b402 facilitator, settles, and
 * only then returns the filing, with the settlement in `PAYMENT-RESPONSE`.
 */
export const dynamic = "force-dynamic"

const PRICE_USD = Number(process.env.X402_PRICE_USD ?? 0.01)
const PAY_TO = (process.env.X402_PAY_TO || process.env.NEXT_PUBLIC_AGENT_WALLET || "") as `0x${string}`

function b64(obj: unknown) {
  return Buffer.from(JSON.stringify(obj)).toString("base64")
}

async function filingJson(docId: string) {
  const filing = await db.query.filings.findFirst({ where: eq(schema.filings.docId, docId) })
  if (!filing || !["parsed", "receipted"].includes(filing.status)) return null
  const [source, trades] = await Promise.all([
    db.query.sources.findFirst({ where: eq(schema.sources.id, filing.sourceId) }),
    db.query.trades.findMany({ where: eq(schema.trades.filingId, filing.id) }),
  ])
  return {
    docId: filing.docId,
    kind: filing.kind,
    url: filing.url,
    sha256: filing.sha256,
    receiptTx: filing.receiptTx,
    filedAt: filing.filedAt.toISOString(),
    readBy: filing.readBy,
    source: source ? { slug: source.slug, name: source.name, kind: source.kind, seat: source.seat, affiliation: source.affiliation } : null,
    trades: trades.map((t) => ({
      ticker: t.ticker,
      assetName: t.assetName,
      side: t.side,
      amountLow: t.amountLow,
      amountHigh: t.amountHigh,
      tradedAt: t.tradedAt.toISOString().slice(0, 10),
      disclosedAt: t.disclosedAt.toISOString().slice(0, 10),
      tokenSymbol: t.tokenSymbol,
    })),
  }
}

export async function GET(req: Request, ctx: { params: Promise<{ docId: string }> }) {
  const { docId } = await ctx.params
  const resourceUrl = new URL(req.url).toString()
  if (!PAY_TO) return NextResponse.json({ error: "X402_PAY_TO is not configured" }, { status: 503 })
  if (!hasKey()) {
    return NextResponse.json({ error: "Payments are not switched on: the Binance Web3 API key with the B402 permission is not configured" }, { status: 503 })
  }

  let accepts: Accept[]
  try {
    accepts = await b402Supported(PRICE_USD, PAY_TO)
  } catch (err) {
    await incident("x402:supported", { docId }, err)
    return NextResponse.json({ error: "The payment facilitator is unavailable" }, { status: 503 })
  }
  const requirements = { x402Version: 2, resource: { url: resourceUrl, description: `Tailcoat parsed filing ${docId}` }, accepts }

  const header = req.headers.get("payment-signature")
  if (!header) {
    const exists = await filingJson(docId)
    if (!exists) return NextResponse.json({ error: "No parsed filing with that id" }, { status: 404 })
    return NextResponse.json(
      { error: "Payment required", price: `$${PRICE_USD.toFixed(2)}`, accepts: accepts.map((a) => ({ asset: a.asset, network: a.network, amount: a.amount })) },
      { status: 402, headers: { "PAYMENT-REQUIRED": b64(requirements), "Access-Control-Expose-Headers": "PAYMENT-REQUIRED, PAYMENT-RESPONSE" } },
    )
  }

  let payload: { accepted?: Accept; payload?: unknown }
  try {
    payload = JSON.parse(Buffer.from(header, "base64").toString("utf8"))
  } catch {
    return NextResponse.json({ error: "PAYMENT-SIGNATURE is not base64 JSON" }, { status: 400 })
  }
  const accepted = accepts.find((a) => a.asset.toLowerCase() === payload.accepted?.asset?.toLowerCase() && a.network === payload.accepted?.network)
  if (!accepted) return NextResponse.json({ error: "That payment option is not one we offered" }, { status: 400 })

  const requestId = randomUUID()
  try {
    const verify = await b402Verify({ paymentPayload: { x402Version: 2, resource: { url: resourceUrl }, accepted, payload: payload.payload }, paymentRequirements: accepted })
    if (!verify.isValid) return NextResponse.json({ error: `Payment refused: ${verify.invalidReason ?? "invalid"}` }, { status: 402 })
    const body = await filingJson(docId)
    if (!body) return NextResponse.json({ error: "No parsed filing with that id" }, { status: 404 })
    const settle = await b402Settle({ paymentPayload: { x402Version: 2, resource: { url: resourceUrl }, accepted, payload: payload.payload }, paymentRequirements: accepted })
    if (!settle.success) return NextResponse.json({ error: `Settlement failed: ${settle.errorReason ?? "unknown"}` }, { status: 402 })
    await db.insert(schema.incidents).values({ area: "x402:sale", input: JSON.stringify({ docId, requestId, payer: settle.payer, amount: settle.amount, tx: settle.transaction }), error: "sold", createdAt: new Date(), resolvedAt: new Date() })
    return NextResponse.json(body, {
      headers: {
        "PAYMENT-RESPONSE": b64({ success: true, transaction: settle.transaction, network: settle.network, payer: settle.payer, amount: settle.amount }),
        "Access-Control-Expose-Headers": "PAYMENT-REQUIRED, PAYMENT-RESPONSE",
      },
    })
  } catch (err) {
    await incident("x402:settle", { docId, requestId }, err)
    return NextResponse.json({ error: "Payment could not be processed" }, { status: 502 })
  }
}
