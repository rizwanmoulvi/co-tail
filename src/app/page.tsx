import type { Metadata } from "next"
import Link from "next/link"
import { LagChart, type LagExample } from "@/components/landing/lag-chart"
import { LiveSession } from "@/components/landing/live-session"
import { TryIt } from "@/components/landing/try-it"
import { Button } from "@/components/ui/button"
import { lagDays } from "@/lib/format"
import { latestFilings, sourceProfile } from "@/server/queries"
import { executableCount, registry } from "@/server/registry"

export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: { absolute: "Tailcoat: copy what Congress trades, on BNB Chain" },
  description:
    "Members of Congress and company insiders must report their stock trades. Tailcoat reads each report and buys the same stocks for you as bStocks on BNB Chain, through a contract that can do nothing else.",
}

const STEPS = [
  {
    title: "A report is published",
    body: "House members file each trade within 45 days; insiders file within two business days. Tailcoat watches both feeds and reads every new report the minute it appears.",
  },
  {
    title: "Tailcoat reads it and writes a receipt",
    body: "A model turns the PDF into structured trades. Each ticker is matched to its bStock on BNB Chain, and the report's fingerprint goes on-chain before anything is bought.",
  },
  {
    title: "The contract buys it for you",
    body: "Your approved USDT is swapped into the bStock and lands in your wallet in the same transaction, within the caps you set. Your exit rules decide when it sells.",
  },
]

const SAFEGUARDS = [
  { title: "The contract can only buy stocks", body: "It swaps approved USDT into tokens on its allowlist, through routers on its allowlist, and sends them to you before the call returns. Nothing stays in it." },
  { title: "Your caps are on-chain", body: "A per-trade cap, a daily cap and a pause switch live on the contract under your address. The operator cannot change them." },
  { title: "Every mirror is simulated first", body: "Each swap is quoted, checked against the reference price, and run through Binance's simulation before it is signed. A failed simulation never reaches the chain." },
  { title: "Every report leaves a mark", body: "The hash of each filing is written to BNB Chain before any trade, so any fill can be checked against the public document it copied." },
]

export default async function LandingPage() {
  const [pelosi, latest, reg] = await Promise.all([sourceProfile("nancy-pelosi"), latestFilings(10), registry()])
  const featured =
    pelosi?.filings.find((f) => f.trades.some((t) => t.side === "buy" && t.token && t.pxTraded && t.pxDisclosed)) ??
    latest.find((f) => f.kind === "house_ptr" && f.trades.some((t) => t.side === "buy" && t.token && t.pxTraded && t.pxDisclosed))
  const trade = featured?.trades.find((t) => t.side === "buy" && t.token && t.pxTraded && t.pxDisclosed)
  const example: LagExample | null =
    featured && trade
      ? {
          ticker: trade.ticker!,
          name: featured.source.name,
          tradedAt: trade.tradedAt,
          disclosedAt: trade.disclosedAt,
          pxTraded: trade.pxTraded!,
          pxDisclosed: trade.pxDisclosed!,
          pxNow: trade.pxNow,
          lagDays: lagDays(trade.tradedAt, trade.disclosedAt),
        }
      : null
  const stocks = executableCount(reg)

  return (
    <div className="mx-auto w-full max-w-[1240px] px-5 sm:px-8">
      <header className="flex items-center justify-between gap-4 py-5">
        <span className="font-heading text-[1.5rem] font-semibold tracking-[0.2px]">Tailcoat</span>
        <Button asChild variant="secondary" className="rounded-full">
          <Link href="/app">Open the app</Link>
        </Button>
      </header>

      <main>
        <section className="pt-10 pb-20 sm:pt-16">
          <h1 className="max-w-[15ch] font-heading text-[clamp(2.9rem,8.4vw,6.5rem)] leading-[0.98] font-medium tracking-[-0.025em]">Congress reports its trades. Tailcoat copies them.</h1>
          <div className="mt-8 grid items-end gap-x-14 gap-y-8 lg:grid-cols-[minmax(0,1fr)_auto]">
            <p className="max-w-[54ch] text-[1.15rem] leading-[1.6] text-ink-soft">
              Members of the House and company insiders have to report what they buy. Tailcoat reads each report the day it is published and buys the same stocks for you as bStocks on BNB Chain, into your own wallet, through a contract that can do nothing else. {stocks} US stocks and funds are available. It works outside the US and starts at $5.
            </p>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <Button asChild size="lg" className="px-7">
                <Link href="/app">Open the app</Link>
              </Button>
              <a href="#how" className="font-bold text-ink">
                See how it works
              </a>
            </div>
          </div>
          <div className="mt-14">
            <LagChart ex={example} />
          </div>
          <div className="mt-8">
            <LiveSession />
          </div>
        </section>

        <section className="border-t border-line py-20">
          <h2 className="max-w-[20ch] font-heading text-[clamp(2rem,5vw,3.4rem)] leading-[1.04] font-semibold tracking-[-0.02em]">What a copy is worth</h2>
          <p className="mt-5 mb-12 max-w-[58ch] text-[1.05rem] leading-[1.6] text-ink-soft">
            You never copy their dollar amount. You set your own amount per trade, and a trailing stop you choose protects the weeks the report did not cover. Try a few.
          </p>
          <TryIt
            ticker={trade?.ticker ?? "NVDA"}
            symbol={trade?.token?.symbol ?? "NVDAB"}
            price={trade?.pxNow ?? trade?.pxDisclosed ?? 230}
            amountLow={trade?.amountLow ?? 1_000_001}
            amountHigh={trade?.amountHigh ?? 5_000_000}
          />
        </section>

        <section id="how" className="scroll-mt-8 border-t border-line py-20">
          <h2 className="font-heading text-[clamp(2rem,5vw,3.4rem)] leading-[1.04] font-semibold tracking-[-0.02em]">How it works</h2>
          <ol className="mt-12 grid gap-x-12 gap-y-12 md:grid-cols-3">
            {STEPS.map((step, i) => (
              <li key={step.title}>
                <span className="font-heading text-[4.5rem] leading-none font-medium text-gold" aria-hidden>
                  {i + 1}
                </span>
                <h3 className="mt-4 font-heading text-[1.6rem] leading-tight font-semibold tracking-[-0.3px]">{step.title}</h3>
                <p className="mt-3 leading-[1.65] text-ink-soft">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="border-t border-line py-20">
          <div className="grid gap-x-16 gap-y-10 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <div>
              <h2 className="font-heading text-[clamp(2rem,5vw,3.4rem)] leading-[1.04] font-semibold tracking-[-0.02em]">What keeps it safe</h2>
              <p className="mt-5 max-w-[40ch] text-[1.05rem] leading-[1.6] text-ink-soft">A mirror is a real swap with your real money. These are the limits Tailcoat works inside.</p>
            </div>
            <dl className="grid gap-x-12 sm:grid-cols-2">
              {SAFEGUARDS.map((item) => (
                <div key={item.title} className="border-t border-line py-6">
                  <dt className="text-[1.05rem] font-bold">{item.title}</dt>
                  <dd className="mt-2 leading-[1.65] text-ink-soft">{item.body}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="border-t border-line py-24 text-center">
          <h2 className="mx-auto max-w-[18ch] font-heading text-[clamp(2.2rem,6vw,4rem)] leading-[1.02] font-medium tracking-[-0.02em]">Copy the trade. Keep your wallet.</h2>
          <Button asChild size="lg" className="mt-9 px-8">
            <Link href="/app">Open the app</Link>
          </Button>
        </section>
      </main>

      <footer className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-line py-8 text-sm text-ink-faint">
        <span>Tailcoat. Built on the Binance Web3 API, BNB Chain and PancakeSwap.</span>
        <span>Reports are late and stocks fall. This is not investment advice.</span>
      </footer>
    </div>
  )
}
