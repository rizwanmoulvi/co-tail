# Follow, pending, record, ledger, unfollow

All state is local: `~/.tailcoat/ledger.json` (override with `TAILCOAT_LEDGER`).

## follow

`node scripts/tailcoat.mjs follow --person <slug> --per-trade <usd> [--daily-cap <usd>] --json`

Stores the choice and the time. Only filings disclosed after this time are copied, so an old filing
is never bought on the day someone starts following.

## pending

`node scripts/tailcoat.mjs pending --json`

Every `buy` line from followed people, disclosed after the follow time, not yet in the ledger, with
a tokenized wrapper on BSC. Each row carries `perTradeUsd` (capped by the day's remaining cap),
`token.address`, `token.multiplier`, `token.status`, and `refPrice`. Build the quote with:

```bash
baw market-order quote --fromTokenQty <perTradeUsd> --fromToken 0x55d398326f99059fF775485246999027B3197955 --toToken <token.address> --binanceChainId 56 --json
```

Implied per-share price = `perTradeUsd / (toCoinAmount * token.multiplier)`. Compare to `refPrice`.

## record

`node scripts/tailcoat.mjs record --trade <tradeId> --order <orderId> --tx <txHash> --usd <spent> --tokens <received> --json`

Writes the copy into the ledger. Run it only after `market-order list` shows `FINISHED`.

## ledger

`node scripts/tailcoat.mjs ledger --json`: follows, copies with their transactions, today's spend.

## unfollow

`node scripts/tailcoat.mjs unfollow --person <slug> --json`
