import { handle, ok } from "@/server/http"
import { executableCount, registry } from "@/server/registry"

/** The tokenized stocks Tailcoat can mirror into, grouped by underlying ticker. */
export async function GET() {
  return handle(async () => {
    const reg = await registry()
    const byTicker: Record<string, { symbol: string; address: string; platform: string; executable: boolean; multiplier: number }[]> = {}
    for (const t of Object.values(reg.tokens)) {
      ;(byTicker[t.underlying] ??= []).push({ symbol: t.symbol, address: t.address, platform: t.platform, executable: t.executable, multiplier: t.multiplier })
    }
    return ok({ builtAt: reg.builtAt, tokens: Object.keys(reg.tokens).length, executable: executableCount(reg), byTicker })
  })
}
