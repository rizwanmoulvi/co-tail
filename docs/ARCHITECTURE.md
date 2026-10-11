# Tailcoat architecture

Tailcoat mirrors publicly disclosed trades (US House Periodic Transaction Reports and SEC Form 4
insider purchases) into bStocks on BNB Smart Chain, for anyone outside the US. It is the BNB Chain
rebuild of Coattails (Solana), entered in the BNB Hack: Tokenized Stocks Edition (submissions lock
2026-10-11 12:00 UTC).

## The loop

```
House Clerk FD index ──┐                                              ┌─> follower wallet A (own USDT, own bStock)
SEC EDGAR Form 4 feed ─┼─> ingest ─> Claude reads PDF ─> trades ─> registry ─> Receipt event ─> TailcoatMirror ─┼─> follower wallet B
                       │   (worker)  (structured output)   (ticker)  (bStock)  (sha256 on BSC)   (quote, guard, simulate, send) └─> ...
```

1. **Ingest** (`src/server/ingest/*`): polls the House Clerk index for new PTRs and EDGAR for new
   Form 4 filings with transaction code `P`.
2. **Read** (`src/server/agent/read-ptr.ts`): the PDF goes to Claude Opus 5.5 as a document with a
   Zod output schema (`messages.stream` with `output_config.format`). Typed and scanned forms take the
   same path. OpenRouter and Sarvam remain as fallbacks when no Anthropic key is set.
3. **Match** (`src/server/registry.ts`): ticker to token on BSC from Binance's public tokenized-stock
   lists, cached on disk, refreshed hourly. bStock first, xStock on BSC second; Ondo listed but marked
   not executable.
4. **Receipt**: one `Receipt(sha256, docId, trades, mirrorable)` event per filing, emitted by the
   operator through the contract. Every execution carries the filing hash.
5. **Execute** (`src/server/bsc/executor.ts`): for each follower with an active approval and caps,
   build the route (Binance Trading API with the contract as `userWalletAddress`, else PancakeSwap V3),
   check the implied per-share price against the reference (`MAX_PRICE_DEVIATION`, 3%), encode
   `mirrorBuy`, simulate it (Binance Transaction API, else `eth_call`), sign with the operator key,
   broadcast (Binance, else RPC), wait for the receipt, decode `Mirrored`.
6. **Exits**: positions track entry and peak; `guardExits` sells on the trailing stop or the time
   limit when the asset is trading, and marks the position "exit due" when the follower has not yet
   approved selling or the asset is paused.

Every job tick leaves a `runs` row; every failure that matters leaves an `incidents` row with its
input. `/api/health` reads both plus the Binance API call counters.

## Custody model

No pooled funds. The follower's "vault" is their own wallet plus two on-chain facts on
`TailcoatMirror`: an ERC-20 approval of USDT (the budget) and `limits[follower]` (per-trade cap,
daily cap, paused). The operator key can call `mirrorBuy`, `mirrorSell` and `receipt`, nothing else.
The owner (today the operator key; a multisig would be the production choice) maintains the stock
and router allowlists. A mirror that would leave anything in the contract reverts.

## Stack

- Next.js 16 App Router, React 19, TypeScript. UI: shadcn (radix-lyra preset), Tailwind v4 inline,
  theme tokens in `globals.css` only. Icons: Phosphor. No emojis.
- Client: wagmi 3 with the injected connector (EIP-6963), viem. Server: viem, the official
  `@binance-web3/wallet` SDK, the Anthropic SDK.
- Data: libSQL via Drizzle: the file `data/tailcoat.db` on one box, Turso when hosted. The registry cache
  is the `kv` table (and `data/registry.json` where the disk allows).
- Contract: Solidity 0.8.28, OpenZeppelin 5.6, Foundry. Tests: 13 unit, 1 BSC mainnet fork.
- Agent: BNB Agent Studio scaffold in `agent/tailcoatreader` (A2A, MCP, x402 faces; ERC-8183 rail).
- Runtime, hosted: the site and API on Vercel (`sin1`), the worker and the agent on Render or Railway
  (Singapore), Turso as the shared database; `docs/DEPLOY.md`. Runtime, one box: pm2 runs
  `tailcoat-web` (next start, 3300), `tailcoat-worker` (tsx) and `tailcoat-agent` (9000) behind Caddy.

## Layout

```
contracts/               TailcoatMirror.sol, tests, deploy script
src/app/                 routes (site, app, API)
src/components/          UI (shadcn in components/ui)
src/lib/                 client-safe helpers (chain facts, wagmi config, wallet calls, queries)
src/server/              server-only: db, registry, binance, bsc executor, prices, ingest, reader, pipeline, records
worker/index.ts          three loops: registry, ingest+read, trade
skills/tailcoat          the Binance Wallet Skill
agent/tailcoatreader     the Agent Studio seller
scripts/                 sync, deploy, e2e, import from Coattails
```
