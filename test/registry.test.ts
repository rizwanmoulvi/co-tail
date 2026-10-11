import { describe, expect, it } from "vitest"
import { buildRegistry, executableCount, normalizeTicker, tokenBySymbol, tokenForTicker, wrappersFor } from "../src/server/registry"
import type { RwaListRow } from "../src/server/binance/public"

// Requirement (docs/ARCHITECTURE.md "Match"): a filing's ticker maps to the best tokenized wrapper on
// BSC: bStock first, then xStock; Ondo is listed but never chosen for execution; other chains and
// share-class spellings are handled; unknown tickers map to nothing.
const rows: RwaListRow[] = [
  { chainId: "56", contractAddress: "0x02FCA66C1D1AFB4E2A7884261EB00F63598A7436", symbol: "NVDAB", ticker: "NVDA", type: 3, multiplier: "1.0007", d: 18 },
  { chainId: "56", contractAddress: "0xaaa0000000000000000000000000000000000001", symbol: "NVDAx", ticker: "NVDA", type: 2, multiplier: "1.0017", d: 18 },
  { chainId: "56", contractAddress: "0xaaa0000000000000000000000000000000000002", symbol: "NVDAon", ticker: "NVDA", type: 1, multiplier: "1.0", d: 18 },
  { chainId: "CT_501", contractAddress: "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh", symbol: "TSLAx", ticker: "TSLA", type: 2, multiplier: "1", d: 8 },
  { chainId: "56", contractAddress: "0xaaa0000000000000000000000000000000000003", symbol: "BRK.Bx", ticker: "BRK.B", type: 2, multiplier: "1", d: 18 },
  { chainId: "56", contractAddress: "0xaaa0000000000000000000000000000000000004", symbol: "AAPLon", ticker: "AAPL", type: 1, multiplier: "1", d: 18 },
]
const reg = buildRegistry(rows, new Date("2026-10-10T00:00:00Z"))

describe("registry", () => {
  it("prefers the bStock wrapper of a ticker", () => {
    expect(tokenForTicker(reg, "NVDA")?.symbol).toBe("NVDAB")
    expect(tokenForTicker(reg, "nvda")?.symbol).toBe("NVDAB")
  })

  it("lists every BSC wrapper best first and keeps Ondo visible but not executable", () => {
    const w = wrappersFor(reg, "NVDA")
    expect(w.map((t) => t.symbol)).toEqual(["NVDAB", "NVDAx", "NVDAon"])
    expect(w[2].executable).toBe(false)
  })

  it("falls back to an xStock when there is no bStock, and never executes an Ondo-only name", () => {
    expect(tokenForTicker(reg, "BRK.B")?.symbol).toBe("BRK.Bx")
    expect(tokenForTicker(reg, "AAPL")).toBeNull()
    expect(wrappersFor(reg, "AAPL")[0]?.symbol).toBe("AAPLon")
  })

  it("ignores tokens on other chains", () => {
    expect(tokenForTicker(reg, "TSLA")).toBeNull()
    expect(tokenBySymbol(reg, "TSLAx")).toBeNull()
  })

  it("matches share classes however the filing spells them", () => {
    for (const spelling of ["BRK/B", "BRK-B", "BRKB", "brk.b"]) expect(tokenForTicker(reg, spelling)?.symbol).toBe("BRK.Bx")
    expect(normalizeTicker(" brk/b ")).toBe("BRK-B")
  })

  it("stores addresses lowercase and reads the multiplier and decimals", () => {
    const t = tokenForTicker(reg, "NVDA")!
    expect(t.address).toBe("0x02fca66c1d1afb4e2a7884261eb00f63598a7436")
    expect(t.multiplier).toBeCloseTo(1.0007)
    expect(t.decimals).toBe(18)
  })

  it("maps nothing for unknown or empty tickers", () => {
    expect(tokenForTicker(reg, "ZZZZ")).toBeNull()
    expect(tokenForTicker(reg, null)).toBeNull()
    expect(tokenForTicker(reg, "")).toBeNull()
  })

  it("counts only what the operator can fill", () => {
    expect(executableCount(reg)).toBe(3)
  })
})
