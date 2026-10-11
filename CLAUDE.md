@AGENTS.md

## Tailcoat notes

- Architecture and the loop: `docs/ARCHITECTURE.md`. Verified API facts (Binance Web3 API, keyless endpoints, bStocks on-chain, House Clerk, EDGAR): `docs/INTEGRATIONS.md`. What changed from Coattails on Solana: `docs/BEFORE-AND-AFTER.md`.
- UI: the design is settled and is ProX's (adilhusain01/proX, which took Umbra's): Bodoni Moda for display, Mulish for the interface, Geist Mono for figures; cream paper, charcoal ink, one gold accent; pill navigation and pill actions, paper sheets with an inset line, hairline rows; one theme, no dark mode. Tokens live in `src/app/globals.css` only; shared pieces in `src/components/umbra.tsx`. shadcn components (add via `npx shadcn@latest add <name>`), Tailwind classes inline in JSX. No emojis anywhere. Zero horizontal overflow at 360 and 390.
- Chain: BSC mainnet only (chain 56). wagmi and viem on the client, viem on the server. The only key that signs on the server is the operator key, and it can only call `TailcoatMirror`.
- Server-only code lives in `src/server/`. The Binance Web3 API goes through `src/server/binance/client.ts` (official SDK) and never from the browser.
- The contract is in `contracts/` (Foundry). After changing it: `forge build`, `forge test`, then `scripts/abi.sh` to regenerate `src/server/bsc/mirror-abi.ts`.
- Deploys (`docs/DEPLOY.md`): the hosted topology is the site on Vercel (`sin1`), the worker and the agent on Render or Railway (Singapore), Turso shared; never a US region, Binance refuses US IPs. One box: everything under pm2. The operator key lives only on the worker; the agent key only on the agent.
- Long-running processes run under pm2 (`npx pm2 status`): `tailcoat-web` on 3300, `tailcoat-worker`, `tailcoat-agent` on 9000. Don't start duplicate dev servers or workers. Stop any check process by pid when the check is done.
- Secrets: `.env`, `keys/`, `agent/tailcoatreader/.studio/` are gitignored. Never print their values.
