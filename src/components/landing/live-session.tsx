import { session } from "@/server/prices"

function until(ms: number | null) {
  if (!ms) return null
  const diff = ms - Date.now()
  if (diff <= 0) return null
  const h = Math.floor(diff / 3_600_000)
  const d = Math.floor(h / 24)
  return d > 0 ? `${d}d ${h % 24}h` : `${h}h ${Math.floor((diff % 3_600_000) / 60_000)}m`
}

/** One line of live state under the hero: whether New York is open, and that bStocks trade regardless. */
export async function LiveSession() {
  const s = await session().catch(() => null)
  if (!s) return null
  const open = s.openState
  const next = until(s.nextOpenTime)
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-soft">
      <span className={`size-2 rounded-full ${open ? "bg-ink" : "bg-gold"}`} aria-hidden />
      <span>
        Right now the US market is <strong className="text-ink">{open ? "open" : (s.marketStatus ?? "closed")}</strong>
        {!open && next ? `. It opens in ${next}.` : "."} bStocks trade on BNB Chain either way, so a report filed tonight is copied tonight.
      </span>
    </p>
  )
}
