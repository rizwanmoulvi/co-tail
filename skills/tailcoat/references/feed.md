# Feed

`node scripts/tailcoat.mjs feed [--person <slug>] [--limit 10] --json`

Lists the latest filings Tailcoat has read, newest first. Each row:

```json
{
  "docId": "20035492",
  "kind": "house_ptr",
  "url": "https://disclosures-clerk.house.gov/public_disc/ptr-pdfs/2026/20035492.pdf",
  "receiptTx": "0x...",
  "filedAt": "2026-09-22T00:00:00.000Z",
  "source": { "slug": "rick-w-allen", "name": "Rick W. Allen", "kind": "house", "seat": "GA12", "affiliation": "R" },
  "trades": [
    {
      "id": 812, "ticker": "AVGO", "assetName": "Broadcom Inc. - Common Stock", "side": "buy",
      "amountLow": 1001, "amountHigh": 15000, "tradedAt": "2026-08-12", "disclosedAt": "2026-09-22",
      "lagDays": 41, "pxTraded": 301.1, "pxDisclosed": 345.2, "pxNow": 351.4,
      "token": { "symbol": "AVGOB", "address": "0x...", "platform": "bstock", "multiplier": 1.0003, "status": { "openState": true, "reasonCode": "TRADING", "nextOpenTime": null } }
    }
  ]
}
```

`token` is null when the stock has no bStock or xStock on BSC. `people` lists everyone with filings:
`node scripts/tailcoat.mjs people --json` returns `slug`, `name`, `filings`, `mirrorable`, `copyReturn`
(mean move of their tokenized buys since disclosure) and `lagCost`.

Prices: `pxNow` is the reference per-share price from Binance's tokenized-stock data; the quote from
`baw market-order quote` is what the wallet would actually pay.
