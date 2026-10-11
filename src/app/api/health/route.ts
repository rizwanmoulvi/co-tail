import { stats } from "@/server/binance/client"
import { handle, ok } from "@/server/http"
import { health } from "@/server/record"

/** Last run per job, unresolved incidents, and Binance API call counters. */
export async function GET() {
  return handle(async () => ok({ ...(await health()), binance: stats.snapshot() }))
}
