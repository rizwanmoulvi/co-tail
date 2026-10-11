// The whole idea in one picture: a member trades, the report comes weeks later, and the price has
// already moved. Drawn from one real filing when there is one; otherwise an illustration.

export type LagExample = {
  ticker: string
  name: string
  tradedAt: string
  disclosedAt: string
  pxTraded: number
  pxDisclosed: number
  pxNow: number | null
  lagDays: number
}

const W = 1000
const H = 350

function y(px: number, lo: number, hi: number) {
  const top = 60
  const bottom = 290
  return bottom - ((px - lo) / (hi - lo || 1)) * (bottom - top)
}

export function LagChart({ ex }: { ex: LagExample | null }) {
  const sample: LagExample = ex ?? {
    ticker: "NVDA",
    name: "an illustration",
    tradedAt: "",
    disclosedAt: "",
    pxTraded: 100,
    pxDisclosed: 112,
    pxNow: 118,
    lagDays: 31,
  }
  const now = sample.pxNow ?? sample.pxDisclosed
  const prices = [sample.pxTraded, sample.pxDisclosed, now]
  const lo = Math.min(...prices) * 0.985
  const hi = Math.max(...prices) * 1.015
  const xTrade = 120
  const xReport = 620
  const xNow = 940
  const yTrade = y(sample.pxTraded, lo, hi)
  const yReport = y(sample.pxDisclosed, lo, hi)
  const yNow = y(now, lo, hi)
  // A few invented wiggles between the real points, so the line reads as a price and not a ruler.
  const mid = (a: number, b: number, t: number, wobble: number) => a + (b - a) * t + wobble
  const hidden = `M${xTrade},${yTrade} L${mid(xTrade, xReport, 0.2, 0)},${mid(yTrade, yReport, 0.2, 9)} L${mid(xTrade, xReport, 0.45, 0)},${mid(yTrade, yReport, 0.45, -11)} L${mid(xTrade, xReport, 0.7, 0)},${mid(yTrade, yReport, 0.7, 7)} L${xReport},${yReport}`
  const copied = `M${xReport},${yReport} L${mid(xReport, xNow, 0.35, 0)},${mid(yReport, yNow, 0.35, -8)} L${mid(xReport, xNow, 0.7, 0)},${mid(yReport, yNow, 0.7, 6)} L${xNow},${yNow}`
  const moveHidden = sample.pxDisclosed / sample.pxTraded - 1
  const fmt = (v: number) => `$${v.toFixed(2)}`

  return (
    <figure className="m-0">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-labelledby="lag-title lag-desc" className="h-auto w-full overflow-visible">
        <title id="lag-title">A stock price between a member&apos;s trade and the day it was reported</title>
        <desc id="lag-desc">
          The member traded {sample.ticker} at {fmt(sample.pxTraded)}. The report came {sample.lagDays} days later, when the price was {fmt(sample.pxDisclosed)}.
          Tailcoat buys on the report day, so the move in between is the part a copier never gets.
        </desc>

        <rect x={xTrade} y="24" width={xReport - xTrade} height="286" rx="10" className="fill-paper-3" opacity="0.55" />
        <line x1="20" y1="310" x2="980" y2="310" className="stroke-line" strokeWidth="1.5" />
        <line x1={xTrade} y1="24" x2={xTrade} y2="318" className="stroke-ink-faint" strokeWidth="1" strokeDasharray="3 5" />
        <line x1={xReport} y1="24" x2={xReport} y2="318" className="stroke-ink-faint" strokeWidth="1" strokeDasharray="3 5" />

        <path d={hidden} pathLength={1} strokeDasharray="1" fill="none" className="animate-draw stroke-ink" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        <path d={copied} pathLength={1} strokeDasharray="1" fill="none" className="animate-draw stroke-gold" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round" style={{ animationDelay: "900ms" }} />

        <circle cx={xTrade} cy={yTrade} r="6.5" className="fill-ink" />
        <circle cx={xReport} cy={yReport} r="6.5" className="fill-gold stroke-paper" strokeWidth="2.5" />

        <g className="animate-rise" style={{ animationDelay: "1800ms" }}>
          <line x1={xReport + 40} y1={yTrade} x2={xReport + 40} y2={yReport} className="stroke-ink" strokeWidth="1.5" />
          <line x1={xReport + 32} y1={yTrade} x2={xReport + 48} y2={yTrade} className="stroke-ink" strokeWidth="1.5" />
          <line x1={xReport + 32} y1={yReport} x2={xReport + 48} y2={yReport} className="stroke-ink" strokeWidth="1.5" />
        </g>

        <g className="hidden fill-ink-soft font-sans text-[15px] sm:block">
          <text x={(xTrade + xReport) / 2} y="52" textAnchor="middle" className="fill-ink-faint">
            Not yet reported
          </text>
          <text x={xTrade} y="338" textAnchor="middle">
            Trade
          </text>
          <text x={xReport} y="338" textAnchor="middle">
            Report, {sample.lagDays} days later
          </text>
          <text x={xNow} y="338" textAnchor="middle">
            Today
          </text>
          <text x={xTrade - 12} y={yTrade - 14} textAnchor="end" className="fill-ink font-bold">
            {sample.ticker} at {fmt(sample.pxTraded)}
          </text>
          <text x={xReport + 60} y={(yTrade + yReport) / 2 + 5} className="fill-ink font-bold">
            The move nobody could copy: {moveHidden >= 0 ? "+" : ""}
            {(moveHidden * 100).toFixed(1)}%
          </text>
          <text x={xReport - 12} y={yReport + (yNow < yReport ? 26 : -14)} textAnchor="end" className="fill-gold-deep font-bold">
            Tailcoat buys here
          </text>
        </g>
      </svg>
      <figcaption className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-ink-soft">
        <span className="flex items-center gap-2">
          <span className="h-1 w-6 rounded-full bg-gold" aria-hidden />
          What a copier gets
        </span>
        <span className="flex items-center gap-2">
          <span className="h-[3px] w-6 rounded-full bg-ink" aria-hidden />
          The weeks before the report
        </span>
        <span className="text-ink-faint sm:ml-auto">
          {ex ? `A real filing: ${ex.name}, ${ex.ticker}. Prices are the underlying's daily closes.` : "An illustration. These are not real prices."}
        </span>
      </figcaption>
    </figure>
  )
}
