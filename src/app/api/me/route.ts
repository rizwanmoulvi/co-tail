import type { NextRequest } from "next/server"
import { followerCash, followerStock, USDT } from "@/server/bsc/executor"
import { fail, handle, isWallet, ok } from "@/server/http"
import { walletState } from "@/server/queries"
import { registry, tokenBySymbol } from "@/server/registry"

export async function GET(req: NextRequest) {
  return handle(async () => {
    const wallet = req.nextUrl.searchParams.get("wallet")
    if (!isWallet(wallet)) return fail("Missing or invalid wallet")
    const owner = wallet.toLowerCase() as `0x${string}`
    const [state, cash, reg] = await Promise.all([walletState(owner), followerCash(owner), registry()])

    // Whether exits can run: the follower must have allowed Tailcoat to sell each open position.
    const allowed = new Map<string, boolean>()
    await Promise.all(
      [...new Set(state.positions.filter((p) => p.status === "open").map((p) => p.tokenSymbol))].map(async (symbol) => {
        const token = tokenBySymbol(reg, symbol)
        if (!token) return
        const held = await followerStock(owner, token)
        allowed.set(symbol, held.tokens > 0 && held.sellable >= held.tokens - 1e-9)
      }),
    )
    const positions = state.positions.map((p) => ({ ...p, sellAllowed: p.status === "open" ? (allowed.get(p.tokenSymbol) ?? false) : null }))
    return ok({ ...state, positions, cash: { ...cash, token: USDT, symbol: "USDT" } })
  })
}
