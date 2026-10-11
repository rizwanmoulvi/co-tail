import { ArrowSquareOut } from "@phosphor-icons/react/dist/ssr"
import type { Metadata } from "next"
import { count, eq, isNotNull } from "drizzle-orm"
import { Badge } from "@/components/ui/badge"
import { StatTile } from "@/components/umbra"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { explorerAddress } from "@/lib/chain"
import { shortAddress } from "@/lib/format"
import { stats } from "@/server/binance/client"
import { db, schema } from "@/server/db"
import { health } from "@/server/record"
import { executableCount, registry } from "@/server/registry"

export const dynamic = "force-dynamic"
export const metadata: Metadata = { title: "The Tailcoat Reader agent" }

const AGENT_WALLET = process.env.NEXT_PUBLIC_AGENT_WALLET || "0xd26b4Bc2325ee796c200b89ce92B2480Eb7FD1de"
const AGENT_URL = process.env.NEXT_PUBLIC_AGENT_URL || "https://agent.tailcoat.adilhusain.xyz"
const AGENT_ID = process.env.NEXT_PUBLIC_AGENT_ERC8004_ID

function Ext({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-bold text-gold-deep hover:underline">
      {children} <ArrowSquareOut aria-hidden />
    </a>
  )
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return <StatTile label={label} value={value} hint={hint} />
}

export default async function AgentPage() {
  const [reads, receipts, fills, h, reg] = await Promise.all([
    db.select({ n: count() }).from(schema.filings).where(isNotNull(schema.filings.readBy)),
    db.select({ n: count() }).from(schema.filings).where(isNotNull(schema.filings.receiptTx)),
    db.select({ n: count() }).from(schema.executions).where(eq(schema.executions.status, "confirmed")),
    health(),
    registry(),
  ])
  const api = stats.snapshot()
  const calls = Object.values(api).reduce((a, s) => a + s.n, 0)

  return (
    <div className="grid gap-10">
      <header className="grid max-w-3xl gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-heading text-[clamp(2.2rem,5vw,3.2rem)] leading-[1.02] font-semibold tracking-[-0.02em]">Tailcoat Reader</h1>
          <Badge variant={AGENT_ID ? "secondary" : "outline"}>{AGENT_ID ? `ERC-8004 agent #${AGENT_ID}` : "Identity pending funding"}</Badge>
        </div>
        <p className="max-w-[60ch] leading-[1.6] text-ink-soft">
          The agent that reads the filings is also a seller on BNB Chain, built with BNB Agent Studio. Other agents can
          buy any filing it has read, as structured JSON with the document hash and the on-chain receipt, over an ERC-8183
          job or an x402 call. It never prices with a model and never signs with one: the price is fixed, the signing is
          fixed code, and the deliverable is a fact the worker already receipted.
        </p>
      </header>

      <section className="flex flex-wrap gap-3">
        <Stat label="Filings read" value={String(reads[0]?.n ?? 0)} hint="House reports and Form 4s, read from the source" />
        <Stat label="Receipts on BSC" value={String(receipts[0]?.n ?? 0)} hint="One Receipt event per filing" />
        <Stat label="Fills" value={String(fills[0]?.n ?? 0)} hint="Mirrors confirmed on-chain" />
        <Stat label="Stocks it can buy" value={String(executableCount(reg))} hint={`${Object.keys(reg.tokens).length} listed on BSC, refreshed hourly`} />
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="gap-3">
          <CardHeader className="gap-2">
            <CardTitle className="text-sm">Identity and wallet</CardTitle>
            <CardDescription className="text-sm leading-relaxed">
              The agent holds its own key, separate from the operator key that runs mirrors. Its ERC-8004 identity
              points at the endpoint below, so a buyer can check who they are paying before they pay.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="font-mono text-xs">{shortAddress(AGENT_WALLET, 6)}</span>
              <Ext href={explorerAddress(AGENT_WALLET)}>BscScan</Ext>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <Ext href={`${AGENT_URL}/.well-known/agent-card.json`}>A2A agent card</Ext>
              <Ext href={`${AGENT_URL}/mcp`}>MCP endpoint</Ext>
              <Ext href={`${AGENT_URL}/x402`}>x402 face</Ext>
            </div>
          </CardContent>
        </Card>
        <Card className="gap-3">
          <CardHeader className="gap-2">
            <CardTitle className="text-sm">What it sells, and for how much</CardTitle>
            <CardDescription className="text-sm leading-relaxed">
              One parsed filing per call, $0.01, paid in U, USD1, USDC or USDT. Ask for a House DocID, an EDGAR
              accession number, or a person&apos;s slug for their latest filings. The agent pays for its own model
              reads out of that revenue; until it earns enough, the operator tops it up.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-1 font-mono text-xs">
            <span>POST {AGENT_URL}/x402  {"{"}&quot;prompt&quot;: &quot;House filing 20035562&quot;{"}"}</span>
            <span>GET  /api/filing/20035562  (free, from this site)</span>
          </CardContent>
        </Card>
      </div>

      <Card className="gap-3">
        <CardHeader className="gap-2">
          <CardTitle className="text-sm">What the worker has been doing</CardTitle>
          <CardDescription className="text-sm leading-relaxed">
            Every job leaves a run record and every failure is kept with its input. This is the health check the
            operator watches.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm">
          <ul className="grid gap-1 font-mono text-xs">
            {h.jobs.map((j) => (
              <li key={j.job} className="flex flex-wrap gap-x-3">
                <span className="w-16">{j.job}</span>
                <span className={j.ok === false ? "text-sell" : "text-muted-foreground"}>
                  {j.startedAt ? `${j.startedAt.toISOString().slice(11, 19)}Z` : "never"} {j.ok === false ? `failed: ${j.error}` : (j.summary ?? "")}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            {h.openIncidents24h} unresolved incidents in 24 hours. Binance Web3 API calls this process: {calls}
            {calls ? ` (${Object.entries(api).map(([k, v]) => `${k} ${v.n}${v.failed ? `/${v.failed} failed` : ""}`).join(", ")})` : ""}.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
