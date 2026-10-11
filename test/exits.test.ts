import { describe, expect, it } from "vitest"
import { exitReason } from "../src/server/pipeline"
import type { Follow, Position } from "../src/server/db/schema"

// Requirement (README "Exits"): a position sells when the price is the chosen fraction below its
// peak since purchase, or when it has been held longer than the chosen limit with no reported sale.
// Each rule can be switched off. Reported sales are handled by the mirror step, not here.
const position = (over: Partial<Position> = {}): Position => ({
  id: 1,
  wallet: "0xabc",
  followId: 1,
  tradeId: 1,
  tokenSymbol: "NVDAB",
  ticker: "NVDA",
  tokens: 0.1,
  costUsd: 20,
  entryPx: 200,
  peakPx: 240,
  lastPx: 230,
  openedAt: new Date(Date.now() - 10 * 86_400_000),
  status: "open",
  exitDue: null,
  closedAt: null,
  closeReason: null,
  closePx: null,
  closeTx: null,
  ...over,
})
const follow = (over: Partial<Follow> = {}): Follow => ({
  id: 1,
  wallet: "0xabc",
  sourceId: 1,
  perTradeUsd: 20,
  autoSell: true,
  trailingStopPct: 0.15,
  maxHoldDays: 90,
  demo: false,
  active: true,
  approveTx: null,
  createdAt: new Date(),
  ...over,
})

describe("exit rules", () => {
  it("fires the trailing stop at exactly the chosen fraction below the peak", () => {
    expect(exitReason(position(), follow(), 204)?.rule).toBe("trailing_stop")
    expect(exitReason(position(), follow(), 204.01)).toBeNull()
  })

  it("does not fire a trailing stop that is switched off", () => {
    expect(exitReason(position(), follow({ trailingStopPct: null }), 100)).toBeNull()
  })

  it("fires the time limit once the position is old enough, and not a day early", () => {
    const f = follow({ trailingStopPct: null, maxHoldDays: 30 })
    expect(exitReason(position({ openedAt: new Date(Date.now() - 30 * 86_400_000) }), f, 230)?.rule).toBe("max_hold")
    expect(exitReason(position({ openedAt: new Date(Date.now() - 29 * 86_400_000) }), f, 230)).toBeNull()
  })

  it("does not fire a time limit that is switched off", () => {
    expect(exitReason(position({ openedAt: new Date(Date.now() - 400 * 86_400_000) }), follow({ maxHoldDays: null }), 230)).toBeNull()
  })

  it("names the rule and the numbers in the reason it records", () => {
    const r = exitReason(position(), follow(), 200)
    expect(r?.text).toMatch(/Trailing stop/)
    expect(r?.text).toMatch(/16\.7%/)
    expect(r?.text).toMatch(/\$240\.00/)
  })
})
