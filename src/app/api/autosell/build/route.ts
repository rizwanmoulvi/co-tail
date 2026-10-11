import { and, eq } from "drizzle-orm"
import { allowSellCalldata, followerStock } from "@/server/bsc/executor"
import { db, schema } from "@/server/db"
import { fail, handle, isWallet, ok } from "@/server/http"
import { registry, tokenBySymbol } from "@/server/registry"

/** The approvals that let exit rules and disclosed sales sell the follower's open positions. */
export async function POST(req: Request) {
  return handle(async () => {
    const { wallet } = (await req.json()) as { wallet?: string }
    if (!isWallet(wallet)) return fail("Connect a wallet first")
    const owner = wallet.toLowerCase() as `0x${string}`
    const reg = await registry()
    const open = await db.query.positions.findMany({ where: and(eq(schema.positions.wallet, owner), eq(schema.positions.status, "open")) })
    const calls: { to: string; data: string; symbol: string }[] = []
    for (const symbol of new Set(open.map((p) => p.tokenSymbol))) {
      const token = tokenBySymbol(reg, symbol)
      if (!token) continue
      const held = await followerStock(owner, token)
      if (held.tokens > 0 && held.sellable < held.tokens) calls.push({ ...allowSellCalldata(token), symbol })
    }
    if (!calls.length) return fail("Selling is already allowed on all your positions")
    return ok({ calls, chainId: 56 })
  })
}
