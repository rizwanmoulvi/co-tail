# Submission notes

Form: https://forms.gle/yToDUzaDMwWnq6R6A (project) and https://forms.gle/EUQ39xf54GHjC2ys5 (the
Developer Experience Report, written by hand; facts in `DX-REPORT-NOTES.md`). Lock: 2026-10-11 12:00 UTC.

## Answers

- Project name: Tailcoat
- One line: Copy the trades Congress and insiders disclose into bStocks on BNB Chain, from your own wallet, through a contract that can do nothing else.
- Repo: https://github.com/adilhusain01/tailcoat (public before the lock)
- Deployed: https://tailcoat.adilhusain.xyz (app at /app, receipts at /app/receipts, agent at /app/agent); agent endpoint https://agent.tailcoat.adilhusain.xyz
- Existing product, new integration: yes. Before: Coattails on Solana (github.com/adilhusain01/Coattails, coattails.adilhusain.xyz, September 2026). After: this. The before-and-after is `docs/BEFORE-AND-AFTER.md`.
- Central asset: bStocks (xStocks on BSC second; Ondo shown and tradeable through the Wallet Skill).
- Binance Web3 API modules used: RWA Data, Trading, Transaction, Wallet, b402, Agentic Wallet (Wallet Skill), BNB Agent Studio.
- Specials: Best Use of Agentic Wallet / Wallet Skills (`skills/tailcoat`); Best Use of BNB Agent Studio (`agent/tailcoatreader`, ERC-8004 identity, ERC-8183 and x402 faces).

## Demo video, four minutes

1. (0:00) The receipts page: a real filing, its sha256, the Receipt transaction on BscScan. "Every fill traces back to a public document."
2. (0:30) A member's page: the filing as Claude read it, the lag cost column, the bStock each ticker maps to. Click Mirror: per-trade, budget, caps, exits. Two transactions in the Binance Web3 Wallet: approve USDT, set caps.
3. (1:30) The worker log: quote from the Trading API, guard against the reference price, simulate through the Transaction API, broadcast. The fill on BscScan: USDT out of the follower, NVDAB into the follower, nothing left in the contract.
4. (2:30) The portfolio: the position, its stop and sell-by, "allow selling". Pause on-chain.
5. (3:00) The agent page, then `baw`: the Wallet Skill follows Pelosi from an Agentic Wallet and buys a bStock with the wallet's own market order. Then an A2A negotiate against the Tailcoat Reader and the x402 402 challenge.
6. (3:45) Before and after in one screen: the Solana receipt next to the BSC receipt.

## Checklist before the lock

- [ ] Contract deployed, address in `.env` and `docs/DEPLOYMENTS.md`, allowlists set
- [ ] One real mirror from the burner follower confirmed on BscScan, linked from the README
- [ ] ERC-8004 identity registered (`bag erc8004 register --endpoint https://agent.tailcoat.adilhusain.xyz`), id on the agent page
- [ ] baw signed in, Wallet Skill run once for real, output in the README
- [ ] Hosted: Turso filled, Render or Railway services up in Singapore, Vercel deployed in `sin1`, the two URLs cross-wired (`DEPLOY.md`); or the VPS with DNS live and the Caddy sites added
- [ ] Repo public, `.env.example` names only, no keys in history (`git log -p | grep -i secret`)
- [ ] Video uploaded, link in the form
- [ ] DX report written by Adil from `DX-REPORT-NOTES.md`
