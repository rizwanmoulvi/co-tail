import { revokeCalldata } from "@/server/bsc/executor"
import { fail, handle, isWallet, ok } from "@/server/http"

/** Unfollow everything: zero the USDT approval and pause the wallet on the mirror. */
export async function POST(req: Request) {
  return handle(async () => {
    const { wallet } = (await req.json()) as { wallet?: string }
    if (!isWallet(wallet)) return fail("Connect a wallet first")
    return ok({ calls: revokeCalldata(), chainId: 56 })
  })
}
