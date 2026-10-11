import { and, eq } from "drizzle-orm"
import { publicClient } from "@/server/bsc/executor"
import { db, schema } from "@/server/db"
import { fail, handle, isWallet, ok } from "@/server/http"

type Intent =
  | { type: "follow"; slug: string; perTradeUsd: number; trailingStopPct?: number | null; maxHoldDays?: number | null }
  | { type: "revoke" }
  | { type: "autosell" }

function clampOrNull(v: unknown, min: number, max: number) {
  if (v === null) return null
  const n = Number(v)
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : null
}

/** Records what a wallet just did on-chain, after checking the transaction landed from that wallet. */
export async function POST(req: Request) {
  return handle(async () => {
    const body = (await req.json()) as { wallet?: string; txHash?: string; intent?: Intent }
    if (!isWallet(body.wallet) || typeof body.txHash !== "string" || !body.intent) return fail("Bad request")
    const wallet = body.wallet.toLowerCase()
    const receipt = await publicClient.waitForTransactionReceipt({ hash: body.txHash as `0x${string}`, timeout: 60_000 })
    if (receipt.status !== "success") return fail("That transaction reverted")
    if (receipt.from.toLowerCase() !== wallet) return fail("That transaction was not sent by this wallet")
    const intent = body.intent

    if (intent.type === "follow") {
      const trailingStopPct = clampOrNull(intent.trailingStopPct, 0.02, 0.9)
      const maxHoldDays = clampOrNull(intent.maxHoldDays, 1, 3650)
      const source = await db.query.sources.findFirst({ where: eq(schema.sources.slug, intent.slug) })
      if (!source) return fail("Unknown member", 404)
      await db
        .insert(schema.follows)
        .values({ wallet, sourceId: source.id, perTradeUsd: intent.perTradeUsd, trailingStopPct, maxHoldDays, approveTx: body.txHash, active: true, createdAt: new Date() })
        .onConflictDoUpdate({
          target: [schema.follows.wallet, schema.follows.sourceId],
          set: { perTradeUsd: intent.perTradeUsd, trailingStopPct, maxHoldDays, approveTx: body.txHash, active: true, createdAt: new Date() },
        })
    } else if (intent.type === "revoke") {
      await db.update(schema.follows).set({ active: false }).where(eq(schema.follows.wallet, wallet))
    } else if (intent.type === "autosell") {
      await db.update(schema.follows).set({ autoSell: true }).where(and(eq(schema.follows.wallet, wallet), eq(schema.follows.active, true)))
    }
    return ok({ txHash: body.txHash })
  })
}
