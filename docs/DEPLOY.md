# Deploying Tailcoat

Three services, one database. The site and its API run on Vercel. The worker and the agent run on
Render (or Railway). Turso holds the database both sides read. The contract lives on BSC and is
deployed once from any machine that holds the operator key.

```
                 Vercel (sin1)                      Render or Railway (Singapore)
      +-----------------------------+        +-----------------------------------+
      |  Next.js site + /api/*      |        |  tailcoat-worker (no HTTP)        |
      |  pages read Turso           |        |    ingest, read with Claude,      |
      |  /api/follow, /api/me:      |        |    receipts, mirrors, exits       |
      |    calldata + RPC reads     |        |    writes Turso, signs with the   |
      |  /api/x402/filing/[docId]   |        |    operator key, calls Binance    |
      |  /api/health reads runs     |        +-----------------------------------+
      +---------------+-------------+        |  tailcoat-agent (web, /ping)      |
                      |                      |    A2A card, MCP, x402 face       |
                      |  Turso (libSQL)      |    fetches filings from the site  |
                      +<-------------------->+-----------------------------------+
                                                             |
                                        BSC mainnet: TailcoatMirror, PancakeSwap, bStocks
```

How the pieces find each other:

| On | Variable | Value |
|---|---|---|
| Vercel and the worker | `DATABASE_URL`, `DATABASE_AUTH_TOKEN` | the same Turso database |
| Vercel | `NEXT_PUBLIC_SITE_URL` | the Vercel URL |
| Vercel | `NEXT_PUBLIC_AGENT_URL` | the Render agent URL (shown on `/app/agent`) |
| Vercel | `NEXT_PUBLIC_AGENT_WALLET`, `X402_PAY_TO` | the agent wallet address |
| Vercel and the worker | `NEXT_PUBLIC_MIRROR_ADDRESS` | the deployed TailcoatMirror |
| Vercel and the worker | `BINANCE_WEB3_API_KEY`, `BINANCE_WEB3_API_SECRET` | the dev-portal key (Vercel needs it only for the x402 route) |
| Worker | `OPERATOR_PRIVATE_KEY` | the operator key; nothing else on any platform holds it |
| Worker and agent | `ANTHROPIC_API_KEY` | Claude |
| Agent | `TAILCOAT_URL` | the Vercel URL, where it fetches parsed filings |
| Agent | `WALLET_PASSWORD`, `WALLET_KEYSTORE_JSON` | the agent's encrypted key (see step 4) |
| Vercel | `CRON_SECRET` | leave unset in this topology; the worker runs on Render |

Regions: the Binance Web3 API refuses US IPs, so the Render services are pinned to Singapore in
`render.yaml`, `vercel.json` pins the functions to `sin1`, and on Railway pick Southeast Asia or
Europe for both services. A US region fails every Binance call with a 403.

## 1. Turso

```sh
turso db create tailcoat --location sin
turso db show tailcoat --url            # DATABASE_URL
turso db tokens create tailcoat         # DATABASE_AUTH_TOKEN
DATABASE_URL=libsql://... DATABASE_AUTH_TOKEN=... npx drizzle-kit push
DATABASE_URL=libsql://... DATABASE_AUTH_TOKEN=... npx tsx scripts/copy-db.ts   # the shipped filings
```

## 2. The contract

From a machine with the operator key and a little BNB: `./scripts/deploy.sh`, then put the printed
address in every `NEXT_PUBLIC_MIRROR_ADDRESS`. Details in `HANDOVER.md`, step 4.

## 3. Render

"New +" > "Blueprint", pick the repo; Render reads `render.yaml` and asks for every secret marked
`sync: false`. Two services come up: `tailcoat-worker` (a background worker: no port, logs in the
dashboard) and `tailcoat-agent` (a web service on `/ping`). Copy the agent's public URL into
Vercel's `NEXT_PUBLIC_AGENT_URL`, and the Vercel URL into the agent's `TAILCOAT_URL` (a redeploy
picks it up). The worker reads filings with Claude at `READ_BATCH` a minute from the moment it
starts, so set the Anthropic key you want billed.

Railway instead: one project, two services from the same repo. Service 1 root `/`, service 2 root
`agent/tailcoatreader`; each root has a `railway.json` with its build and start commands. Add the
same variables, set the region to Southeast Asia, and give the agent a public domain.

## 4. The agent's key

The agent signs with its own wallet, created by `bag wallet new --generate-password` on the machine
that scaffolded it (the VPS today). The keystore is `agent/tailcoatreader/.studio/wallets/<address>.json`
and the password is `WALLET_PASSWORD` in `agent/tailcoatreader/.studio/.env.local`; neither is in
the repo or the zip. On a platform the runtime takes both from the environment: paste the keystore
file's contents as `WALLET_KEYSTORE_JSON` and the password as `WALLET_PASSWORD`. Making a new wallet
is fine too (`cd agent/tailcoatreader/app/agent && bag wallet new --generate-password`), then update
`[wallet] address` in `studio.toml`, `NEXT_PUBLIC_AGENT_WALLET` and `X402_PAY_TO`, and fund the new
address. Register its identity once it is reachable:
`bag erc8004 register --endpoint https://<agent host>` from that same machine.

## 5. Vercel

```sh
vercel link
vercel env add DATABASE_URL production      # and the rest of the Vercel rows above
vercel deploy --prod
```

Check: the site lists filings (Turso), `/app/agent` links to the Render agent, `/api/health` shows
the three jobs with recent runs (written by the Render worker), and the Render agent's
`/.well-known/agent-card.json` answers.

## Other ways to run it

- One box (the VPS today): `npm run build && npx pm2 start ecosystem.config.cjs` runs the site on
  3300, the worker and the agent on 9000 behind Caddy, on the local SQLite file.
- Vercel only, no server: the worker's loops exist as `/api/cron/ingest`, `/api/cron/trade` and
  `/api/cron/registry`, guarded by `CRON_SECRET`. Add a `crons` block to `vercel.json` (every minute
  for the first two, hourly for the third; Pro plan, since Hobby crons run daily and functions cap
  at 60 s) or point any one-minute pinger at them with `?secret=`. The agent still needs a box or
  AWS (`bag deploy --provider aws`).
