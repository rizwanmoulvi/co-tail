# Handover

Written 2026-10-10 for whoever finishes Tailcoat for the BNB Hack: Tokenized Stocks Edition.
Submissions lock on 2026-10-11 at 12:00 UTC. The two forms are in `SUBMISSION.md`.

## Where everything is

- This zip is the repo at commit `2fcfdcf` plus the database and the registry cache, minus every
  secret. Secrets never go in git or in a zip: the real `.env`, `keys/` and
  `agent/tailcoatreader/.studio/` exist only on Adil's VPS at `/root/Projects/tailcoat`.
- The site, worker and agent are running on that VPS under pm2 (`tailcoat-web` on 3300,
  `tailcoat-worker`, `tailcoat-agent` on 9000). Caddy is not pointed at them yet because the DNS
  records do not exist yet; `scripts/site-live.sh` adds the sites once they resolve. The hosted
  topology (`DEPLOY.md`) does not depend on the VPS at all.
- Read in this order: `README.md`, `docs/ARCHITECTURE.md`, `docs/INTEGRATIONS.md` (every API fact
  that was checked live, and what was not), `docs/BEFORE-AND-AFTER.md`, `docs/SUBMISSION.md`,
  `docs/DX-REPORT-NOTES.md` (facts for the hand-written report), `docs/DEPLOYMENTS.md`.

## What is done and verified

- `contracts/src/TailcoatMirror.sol`: 13 unit tests and a BSC mainnet fork test pass (`cd contracts && forge test`; `BSC_RPC_URL=https://bsc-dataseed.binance.org forge test --match-contract Fork`).
- Backend: registry, keyless prices and status, executor, pipeline, run records, health route. `npm test` passes (13 tests). `npx tsc -p tsconfig.server.json` is clean. `npm run build` is clean.
- The filing reader on Claude Opus 5.5 read a real 42-line filing correctly. 465 filings are in the database (457 imported from Coattails, the rest read today), 850 trades mapped to a bStock or xStock on BSC.
- Site: every page and API serves. Wallet Skill (`skills/tailcoat`) runs against the API end to end up to the `baw` call. Agent Studio seller answers `/ping`, serves its A2A card and MCP, and returns signed ERC-8183 quotes; the x402 face is dormant until merchant credentials exist.

## What is not done, and exactly how to do it

Everything left needs a key, money or DNS. In order:

1. **Secrets and keys.** `cp .env.example .env`. Either get the three key files from Adil out of band (`keys/operator.json`, `keys/follower-burner.json`, and the agent's `.studio/` folder with its `WALLET_PASSWORD`) or make new ones: `cast wallet new --json > keys/operator.json`, the same for the burner, and in `agent/tailcoatreader/app/agent` run `bag wallet new --generate-password`, then put the new agent address in `studio.toml` under `[wallet] address`, in `.env` as `NEXT_PUBLIC_AGENT_WALLET` and `X402_PAY_TO`. New keys need new funding (step 3). Put `ANTHROPIC_API_KEY` in both `.env` and the agent's `.studio/.env.local`.
2. **Binance Web3 API key.** Create a project at https://web3.binance.com/en/dev-portal, create a key, enable the B402 Payments permission and complete the merchant onboarding on the project. Put key and secret in `.env`. Then `npx tsx --env-file=.env scripts/live-check.ts`: it calls every signed endpoint the executor uses without sending anything and prints the facts for the report. Note the `tx.to` and `approveTarget` it prints for the swap route: those two addresses go on the contract's router allowlist in step 4.
3. **Fund on BSC mainnet.** Operator about 0.03 BNB. Burner follower 0.01 BNB plus 20 USDT (BEP-20). Agent wallet 0.03 BNB plus 2 U (`0xcE24439F2D9C6a2289F741120FE202248B666666`). The addresses on the VPS today are in `DEPLOYMENTS.md`; if you made new keys, use yours.
4. **Deploy the contract.** `./scripts/deploy.sh` deploys with the operator as operator and owner, allowlists the PancakeSwap V3 router and every executable stock in `data/registry.json`, and prints the address. Put it in `.env` as `NEXT_PUBLIC_MIRROR_ADDRESS`, record it in `docs/DEPLOYMENTS.md`, and add the Binance router addresses from step 2 with `cast send <mirror> "setRouters(address[],bool)" "[0x...,0x...]" true --private-key <operator key> --rpc-url https://bsc-dataseed.binance.org`. Restart the worker (`npx pm2 restart tailcoat-worker`): it starts writing one Receipt event per filing, newest first, about 0.0001 BNB each.
5. **One real mirror.** `npx tsx --env-file=.env scripts/e2e.ts` makes the burner approve 50 USDT and set caps, writes a receipt, buys 10 USDT of NVDAB through the contract and sells half back. It prints the hashes; put the buy hash in the README and the receipts page shows it. If a route is refused by the 3% guard during a quiet hour, that is the guard working; try again or raise `MAX_PRICE_DEVIATION` for the test only.
6. **Agent identity.** In `agent/tailcoatreader/app/agent`: `bag doctor`, then `bag erc8004 register --endpoint https://agent.tailcoat.adilhusain.xyz` once the agent is reachable there, `bag erc8004 show` for the id, and put the id in `.env` as `NEXT_PUBLIC_AGENT_ERC8004_ID`. The B402 merchant application for the agent wallet is at https://developers.binance.com/en/docs/products/onchainpay-x402/basics/6.apply-developer-account; it is approved by hand and may not land before the lock, which `README.md` already says.
7. **Hosting.** Either the hosted topology in `DEPLOY.md` (Vercel plus Render or Railway plus Turso, the recommended path for a team), or the VPS: at Namecheap add A records `tailcoat` and `agent.tailcoat` to `13.140.56.191` and AAAA to `2400:d321:2360:5616::1`, then on the VPS `./scripts/site-live.sh`, set `NEXT_PUBLIC_SITE_URL` and rebuild (`npm run build && npx pm2 restart tailcoat-web`). Whichever host serves the agent is the endpoint for step 6.
8. **GitHub.** Create the private repo `adilhusain01/tailcoat`, add the deploy key `~/.ssh/tailcoat_deploy.pub` from the VPS with write access (or your own key), `git push -u origin main`, and make it public before the lock. Check `git log -p | grep -iE "sk-ant|sk_|secret="` prints nothing.
9. **Agentic Wallet.** On the VPS: `npm i -g @binance/agentic-wallet`, `baw auth signin --json`, scan the link with the Binance app within five minutes, `baw auth verify --qrCodeId <id> --json`. Then install the skill where your agent runs (`npx skills add adilhusain01/tailcoat/skills/tailcoat` after the push, or point it at the folder) and run one real follow and buy; keep the `market-order list` output for the README and the video.
10. **Video and report.** Outline in `SUBMISSION.md`. The report must be hand-written; `DX-REPORT-NOTES.md` has the facts with where each one happened.

## Deploying: Vercel for the site, Render or Railway for the server

`docs/DEPLOY.md` is the whole path and the coupling table. In short: create a Turso database and copy
the shipped filings into it (`scripts/copy-db.ts`); apply `render.yaml` as a Blueprint (or two Railway
services from the repo roots) in Singapore; deploy the site to Vercel (`vercel.json` pins it to
`sin1`); point `NEXT_PUBLIC_AGENT_URL` at the Render agent and the agent's `TAILCOAT_URL` at the
Vercel site. The worker holds the operator key, the agent holds its own key as `WALLET_KEYSTORE_JSON`
plus `WALLET_PASSWORD`, and nothing else holds either. Never a US region: Binance refuses US IPs.

## The design

It is ProX's, taken in full on 2026-10-10 at Adil's request: same fonts, tokens, pill navigation,
sheets and landing narration. Keep it. Tokens are in `src/app/globals.css`, shared pieces in
`src/components/umbra.tsx`, and the landing in `src/app/page.tsx` with its parts in
`src/components/landing/`. Screenshots at 1440 and 390 were checked with no horizontal overflow.

## Things to know before you touch the code

- The only key that signs on the server is the operator key, and it can only call `TailcoatMirror`. Keep it that way.
- The worker reads filings with Claude Opus 5.5 at `READ_BATCH` per minute, roughly $0.10 a filing. Lower `READ_BATCH` if the key is on a tight budget; the watchlist names are read first.
- `scripts/e2e.ts --anvil` exists but a full run on a public BSC fork did not succeed (see `INTEGRATIONS.md`); use the Foundry fork test and the mainnet run instead.
- Binance's wagmi connector does not install next to wagmi 3; the site uses the injected connector, which the Binance Web3 Wallet extension supports through EIP-6963.
- `agent/tailcoatreader/app/agent/src/tailcoat.ts` is the only file in the scaffold that was changed by hand besides `studio.toml` and the `runWork` hook in `dualMain.ts`. `pnpm install` inside `agent/tailcoatreader` restores its dependencies.

## Getting started from the zip

```sh
unzip tailcoat-handover.zip && cd tailcoat
npm install
(cd agent/tailcoatreader && pnpm install)
cp .env.example .env
npx drizzle-kit push          # keeps the shipped data/tailcoat.db, creates nothing new
npm test && npx tsc -p tsconfig.server.json && (cd contracts && forge build && forge test)
npm run build && npx next start -p 3300
```
