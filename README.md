# Tailcoat

Tailcoat copies the stock trades that US members of Congress and company insiders disclose into
bStocks on BNB Smart Chain, into the follower's own wallet, through a contract that can do nothing
else. It is the BNB Chain version of [Coattails](https://github.com/adilhusain01/Coattails) (Solana,
September 2026), rebuilt on the Binance Web3 API for the BNB Hack: Tokenized Stocks Edition.

Autopilot proved people want this: it manages $1.3B, has about 3M downloads, and $400M of that copies
Nancy Pelosi alone. Autopilot needs a US brokerage account. bStocks are sold only outside the US, to
people with a wallet. Tailcoat connects the two.

| | |
|---|---|
| Site | https://tailcoat.adilhusain.xyz |
| App | https://tailcoat.adilhusain.xyz/app |
| Receipts (every filing hash and every fill on BSC) | https://tailcoat.adilhusain.xyz/app/receipts |
| The agent | https://tailcoat.adilhusain.xyz/app/agent |
| Contract `TailcoatMirror` (BSC mainnet) | see `docs/DEPLOYMENTS.md` |
| Before and after: Solana to BNB Chain | `docs/BEFORE-AND-AFTER.md` |

## What happens when a member files

1. **The filing is published.** House members file Periodic Transaction Reports (PTRs) with the
   Clerk, up to 45 days after trading. Company insiders file SEC Form 4 within two business days.
2. **The agent reads it.** The PDF goes to Claude Opus 5.5, which turns each PTR into structured
   trades against a strict schema. Form 4 is XML and is parsed directly. Each ticker is matched
   against Binance's own tokenized-stock lists: bStocks first, xStocks on BSC second. Ondo's tokens
   are shown but never executed by the contract, because they fill only through RFQ with the
   follower's own signature.
3. **A receipt goes on-chain.** Before any trade, the operator emits a `Receipt` event on the
   TailcoatMirror contract with the filing's sha256 hash. Anyone can check that a fill copied a
   real public document.
4. **Followers' wallets mirror it.** For every follower, the contract pulls that follower's
   per-trade amount of USDT (within the caps the follower set on-chain), swaps it through an
   allowed router, and hands the bStock to the follower in the same transaction. The route is
   quoted through the Binance Trading API, checked against the reference price from the RWA Data
   API, simulated through the Transaction API before it is signed, and broadcast through it.

## Exits

Reports arrive late, so a member can sell weeks before anyone sees it. Every position bought through
Tailcoat carries its own exit rules, set when you start following someone and checked against the
live price every 20 seconds:

- a trailing stop (10%, 15% or 25% below the highest price since purchase, or off)
- a time limit (30, 90 or 180 days without a reported sale, or off)
- a reported sale by the member sells only what was bought from that member

Selling needs one extra approval per stock, on that stock only. The portfolio asks for it as soon as
a position exists without it. When an asset is paused or the market is closed, the exit waits and the
position says so.

## The custody model

Nothing is pooled and nothing stays in the contract. `contracts/src/TailcoatMirror.sol`:

- Following is an ERC-20 approval of USDT to the contract (the budget) plus `setLimits(maxPerTrade,
  dailyCap)`, both signed by the follower. `setPaused(true)` or a zero approval stops everything.
- The operator can only call `mirrorBuy` and `mirrorSell`: swap approved cash into an allowlisted
  stock through an allowlisted router, with a minimum output, with the stock (or the cash) sent to
  the follower before the call returns. A short fill reverts; unspent cash is refunded.
- The owner maintains the stock and router allowlists from the registry. Nothing else is privileged.

Thirteen unit tests and a BSC mainnet fork test (a real 10 USDT to NVDAB swap on PancakeSwap V3
through the contract) are in `contracts/test`.

## The agent

The reader is also a seller on BNB Chain, scaffolded with BNB Agent Studio (`agent/tailcoatreader`).
It has its own wallet and an ERC-8004 identity, serves an A2A agent card, an MCP endpoint and an
x402 face, and sells any filing it has read as structured JSON for $0.01 per call. The price is
fixed in `studio.toml`, the signing is fixed code, and the deliverable comes from the receipted record,
not from a model.

## The Wallet Skill

`skills/tailcoat` lets anyone run the same strategy from their own Binance Agentic Wallet, with the
wallet signing each buy: `npx skills add adilhusain01/tailcoat/skills/tailcoat`, then "Follow Nancy
Pelosi with $20 per trade". The helper script reads the Tailcoat feed and keeps a local ledger; the
buys go through the `binance-agentic-wallet` skill's market orders with that skill's confirmation rules.

## What's in the repo

| Path | What it does |
|---|---|
| `contracts/` | `TailcoatMirror.sol`, Foundry tests (unit and BSC fork), deploy script |
| `src/server/ingest/house.ts` | House Clerk yearly index: new PTRs, member photos and party |
| `src/server/agent/read-ptr.ts` | Claude Opus 5.5 reads a PTR PDF into structured trades (OpenRouter and Sarvam as fallbacks) |
| `src/server/ingest/sec.ts` | EDGAR Form 4: open-market insider purchases in tokenized stocks |
| `src/server/registry.ts` | Ticker to bStock, xStock or Ondo token on BSC, from Binance's public lists, refreshed hourly |
| `src/server/binance/` | The signed Binance Web3 API through the official SDK, and the keyless price and status endpoints |
| `src/server/bsc/executor.ts` | Routes (Binance aggregator, PancakeSwap V3 fallback), the price guard, the simulation gate, signing and broadcast |
| `src/server/prices.ts` | Per-share prices from the bStock price and share multiplier, market session, daily candles |
| `src/server/pipeline.ts`, `worker/index.ts` | Three loops: registry hourly, ingest and read every minute, receipts, mirrors and exits every 20 seconds, each with run records |
| `src/server/record.ts` | Run records, incidents, the health check |
| `src/app/` | The site and the app: filings, people, receipts, portfolio, the agent page |
| `skills/tailcoat` | The Wallet Skill |
| `agent/tailcoatreader` | The Agent Studio seller |
| `scripts/e2e.ts` | End to end on a chain: follow, receipt, mirror, sell |
| `scripts/copy-db.ts` | Copies the shipped SQLite filings into Turso |
| `render.yaml`, `railway.json`, `vercel.json` | The hosted topology: worker and agent on Render or Railway, site on Vercel in Singapore |
| `docs/` | Architecture, deploying (Vercel plus Render or Railway plus Turso), verified API facts, before and after, deployments, the handover, notes for the developer experience report |

## Getting started

Prerequisites: Node 22 or newer, Foundry, and a Binance Web3 API key from https://web3.binance.com/en/dev-portal
(the worker runs without one, on public endpoints and PancakeSwap, but the Trading and Transaction
APIs need it).

```sh
git clone git@github.com:adilhusain01/tailcoat.git && cd tailcoat
npm install
cp .env.example .env               # fill in the keys you have; names only in the example
npx drizzle-kit push                # creates data/tailcoat.db
cast wallet new --json > keys/operator.json   # the operator key; fund it with a little BNB
npx tsx --env-file=.env scripts/sync-index.ts 60      # House index
npx tsx --env-file=.env scripts/sync-form4.ts 7       # last 7 days of insider buys
./scripts/deploy.sh                 # deploys TailcoatMirror; put the address in .env as NEXT_PUBLIC_MIRROR_ADDRESS
npm test                            # vitest: registry and exit rules
(cd contracts && forge test)        # contract tests; BSC_RPC_URL=... forge test --match-contract Fork for the fork test
npx tsx --env-file=.env scripts/e2e.ts   # a real $10 mirror from keys/follower-burner.json
npm run build && npx pm2 start ecosystem.config.cjs
```

That is the one-box setup. The hosted setup is the site on Vercel, the worker and the agent on
Render or Railway, and Turso as the shared database: `docs/DEPLOY.md` has the blueprint
(`render.yaml`, the two `railway.json` files, `vercel.json`) and the table of which variable goes
where.

## Design

The site takes ProX's design in full (adilhusain01/proX, which took it from Umbra): Bodoni Moda, Mulish and
Geist Mono; cream paper, charcoal ink and one gold accent; pill navigation; paper sheets with an inset line;
hairline rows. The landing page follows ProX's order: the idea in one chart (a real filing's reporting
delay), a worked example, three steps, safeguards, a closing line.

## Stack

Next.js 16, React 19, shadcn/ui, Tailwind v4, TanStack Query, Zustand, wagmi and viem on BSC,
Drizzle on libSQL, the Anthropic SDK (Claude Opus 5.5), `@binance-web3/wallet` (the official Binance
Web3 API SDK), Foundry and OpenZeppelin for the contract, BNB Agent Studio for the agent.

## Limits

- Disclosures are late: House members have up to 45 days. Every filing shows the price move between
  the trade and its disclosure, so followers see what the delay cost. Insider Form 4s arrive within
  two days.
- Not every stock is tokenized. Trades without a bStock or xStock on BSC are shown and marked "not
  tokenized". Ondo names are shown as wrappers but not executed by the contract.
- The x402 face of the agent settles only once Binance issues B402 merchant credentials for the
  agent's wallet, a manual approval. Until then the face answers with a 503 that says so, and the
  ERC-8183 rail (on-chain escrow in U) works without it.
- Tokenized stocks are not offered to US persons. Not investment advice.
