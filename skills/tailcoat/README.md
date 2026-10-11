# Tailcoat Wallet Skill

Lets a Binance Agentic Wallet copy the stock trades that US members of Congress and company
insiders disclose, into bStocks on BNB Smart Chain, with the wallet signing every buy itself.

Install next to the Binance skills:

```sh
npx skills add adilhusain01/tailcoat/skills/tailcoat
```

Then tell your agent: "Follow Nancy Pelosi with $20 per trade" or "What did Congress buy this week".

`scripts/tailcoat.mjs` reads the Tailcoat API and keeps a ledger in `~/.tailcoat/ledger.json`. It
has no dependencies, needs Node 18+, and never signs or holds anything. Buys go through the
`binance-agentic-wallet` skill's `market-order` commands with that skill's confirmation rules.
