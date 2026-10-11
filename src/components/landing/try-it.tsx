"use client"

// A worked example the visitor can push around: pick how much to mirror and a move, see what a copy is worth.

import { useState } from "react"
import { usd } from "@/lib/format"

const AMOUNTS = [5, 10, 25, 50]

export function TryIt({ ticker, symbol, price, amountLow, amountHigh }: { ticker: string; symbol: string; price: number; amountLow: number | null; amountHigh: number | null }) {
  const [move, setMove] = useState(8)
  const [amount, setAmount] = useState(25)
  const shares = amount / price
  const after = amount * (1 + move / 100)
  const net = after - amount
  const stop = price * 0.85
  const range =
    amountLow != null && amountHigh != null && amountLow !== amountHigh
      ? `${usd(amountLow, 0)} to ${usd(amountHigh, 0)}`
      : amountLow != null
        ? usd(amountLow, 0)
        : "an undisclosed amount"

  return (
    <div className="grid gap-x-14 gap-y-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <div className="flex flex-col gap-8">
        <fieldset>
          <legend className="text-ink-soft">You mirror each of their buys with</legend>
          <div className="mt-3 grid grid-cols-4 gap-2">
            {AMOUNTS.map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={amount === value}
                onClick={() => setAmount(value)}
                className={`cursor-pointer rounded-lg py-3 font-bold transition-[scale,background-color,color,box-shadow] duration-150 ease-out-strong active:scale-[0.97] ${
                  amount === value ? "bg-ink text-paper" : "shadow-[inset_0_0_0_1.5px_var(--line)] hover:shadow-[inset_0_0_0_1.5px_var(--ink)]"
                }`}
              >
                ${value}
              </button>
            ))}
          </div>
        </fieldset>
        <div>
          <label htmlFor="move" className="flex items-baseline justify-between gap-4">
            <span className="text-ink-soft">After you buy, {ticker} moves</span>
            <span className="font-heading text-[2rem] leading-none font-medium tracking-[-0.4px]">
              {move > 0 ? "+" : ""}
              {move}%
            </span>
          </label>
          <input id="move" type="range" min={-20} max={20} step={1} value={move} onChange={(e) => setMove(Number(e.target.value))} className="mt-4 h-8 w-full cursor-pointer accent-[var(--ink)]" />
          <div className="flex justify-between text-[0.8rem] text-ink-faint">
            <span>-20%</span>
            <span>0</span>
            <span>+20%</span>
          </div>
        </div>
        <p className="text-sm leading-relaxed text-ink-faint">
          They reported buying {range} of {ticker}. Before gas and the swap fee; the operator pays the gas.
        </p>
      </div>

      <div className="flex flex-col justify-center gap-5" aria-live="polite">
        <Row label={`You buy ${symbol}`} value={`${shares.toFixed(4)} shares at ${usd(price)}`} />
        <Row label="The move" value={`${net >= 0 ? "+" : "-"}${usd(Math.abs(net))}`} tone={net >= 0 ? "gain" : "loss"} />
        <div className="border-t border-line pt-5">
          <Row label="You end up with" value={usd(after)} large />
        </div>
        <p className="leading-relaxed text-ink-soft">
          {move <= -15
            ? `A 15% trailing stop would have sold at ${usd(stop)} on the way down, before most of this.`
            : move < 0
              ? `Still above the 15% trailing stop at ${usd(stop)}. The position stays open.`
              : `The trailing stop rises with the price: from a peak of ${usd(price * (1 + move / 100))} it would sell at ${usd(price * (1 + move / 100) * 0.85)}.`}
        </p>
      </div>
    </div>
  )
}

function Row({ label, value, tone, large }: { label: string; value: string; tone?: "gain" | "loss"; large?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className={large ? "text-[1.05rem] font-bold" : "text-ink-soft"}>{label}</span>
      <span className={`font-mono ${large ? "text-[1.3rem]" : "text-[1.05rem]"} ${tone === "loss" ? "text-danger" : tone === "gain" ? "text-gold-deep" : "text-ink"}`}>{value}</span>
    </div>
  )
}
