import { eq } from "drizzle-orm"
import { followCalldata } from "@/server/bsc/executor"
import { db, schema } from "@/server/db"
import { fail, handle, isWallet, ok } from "@/server/http"

/**
 * The calls a follower signs to follow someone: approve USDT to the mirror (their budget) and set
 * their own on-chain caps. The wallet sends them; nothing here is custodial.
 */
export async function POST(req: Request) {
  return handle(async () => {
    const body = (await req.json()) as { wallet?: string; slug?: string; perTradeUsd?: number; budgetUsd?: number; dailyCapUsd?: number }
    if (!isWallet(body.wallet)) return fail("Connect a wallet first")
    const per = Number(body.perTradeUsd)
    const budget = Number(body.budgetUsd)
    const daily = Number(body.dailyCapUsd ?? Math.min(budget, per * 5))
    if (!(per >= 1 && per <= 1000)) return fail("Per-trade amount must be between $1 and $1,000")
    if (!(budget >= per && budget <= 100_000)) return fail("Budget must be at least the per-trade amount")
    if (!(daily >= per && daily <= budget)) return fail("Daily cap must be between the per-trade amount and the budget")
    const source = await db.query.sources.findFirst({ where: eq(schema.sources.slug, String(body.slug)) })
    if (!source) return fail("Unknown member", 404)
    return ok({ calls: followCalldata(budget, per, daily), chainId: 56 })
  })
}
