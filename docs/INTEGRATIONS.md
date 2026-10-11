# Tailcoat integration reference

Everything below was checked with live requests from the VPS in Mumbai on **2026-10-10** unless
marked **[UNVERIFIED]**. The Solana-side facts Coattails verified in September are in that repo's
`docs/INTEGRATIONS.md` and are not repeated.

## TL;DR

| Area | Status |
|---|---|
| Binance Web3 API, signed | HMAC-SHA256 over `timestamp + METHOD + requestPath + body`, headers `X-OC-APIKEY`, `X-OC-TIMESTAMP`, `X-OC-SIGN`; base `https://web3.binance.com/build`; key and secret from the dev portal. **IP-gated**: the prohibited list is US and territories, Canada, Netherlands, Iran, Cuba, North Korea, Crimea, Donetsk, Luhansk, UK, and Japan (conditional). India is not on it. The official SDK `@binance-web3/wallet` 13.0.1 (Node 22.12+) wraps every endpoint used here. |
| Binance keyless endpoints | `www.binance.com/bapi/defi/...` serves the tokenized-stock list, live price with share multiplier, per-asset status, market status with next open, and candles, with no key. These are the endpoints Binance's own Wallet Skills read. Verified live. |
| bStocks on-chain | Plain 18-decimal BEP-20s (NVDAB `0x02fca66c1d1afb4e2a7884261eb00f63598a7436`, bytecode 284 bytes, no `paused()`/`owner()`, EIP-1967 slot empty). Issuer BTech Holdings (Binance affiliate), 1:1 backed, per Binance's 2026-06-12 announcement. 91 bStocks on BSC. |
| PancakeSwap V3 | NVDAB/USDT pools by fee tier: 0.01% $3.9, 0.05% $16k, **0.25% $3.51M USDT + 12,723 NVDAB**, 1% $239k. V2 pair also exists. SwapRouter `0x1b81D678ffb9C0263b24A97847620C99d213eB14` (factory `0x0BFbCF9fa4f9C56B0F40a671Ad40E0805A091865`), QuoterV2 `0xB048Bbc1Ee6b733FFfCFb9e9CeF7375518e25997`. A 10 USDT swap through the Tailcoat contract on a mainnet fork returned 0.043330 NVDAB (1.64M gas). |
| Trading API routing | bStocks (type 3): LiquidMesh SWAP route plus PcsXRfq RFQ. xStocks (type 2): AMM only, SWAP. Ondo (type 1): RFQ only (InchFusion, CowSwap, PcsXRfq), needs `userWalletAddress` and an EIP-712 signature from that wallet. Quote IDs live about 30 s. Market-hours errors 40367 (Ondo), 40369 (bStock). From the docs; **[UNVERIFIED]** by a live call until a key is active. |
| Transaction API | `POST /api/v1/dex/pre-transaction/simulate` with `evmTx{from,to,value,data}` returns `status`, `failReason`, `balanceChanges`, `allowanceChanges`. `POST .../broadcast-transaction` with `signedTransaction` (RLP hex), `address`, `enableMevProtection`. From the docs; **[UNVERIFIED]** live. |
| b402 (x402) | `POST /api/v2/b402/{supported,verify,settle}` on the signed API with the B402 Payments permission; merchant onboarding is in the dev-portal project (error 1160401 otherwise). USDT and USDC pay via Permit2 (`0x000000000022D473030F116dDEE9F6B43aC78BA3`), U and USD1 via EIP-3009. The Agent Studio scaffold instead wants four `B402_*` merchant credentials from Binance OnchainPay, approved by hand. |
| Agentic Wallet | `npm i -g @binance/agentic-wallet` gives `baw` 1.10.0; runs headless (verified `baw wallet status --json` → `UNCONNECTED`). Sign-in: `baw auth signin --json` returns a URL and pairing code to scan with the Binance app within 5 minutes, then `baw auth verify --qrCodeId`. Trades: `baw market-order quote|swap --fromTokenQty --fromToken --toToken --binanceChainId 56 --json`, poll `market-order list --orderId` to `FINISHED`. External signing (`contract-call`, `sign-message`) needs Developer Mode on in the app. |
| Agent Studio | `npm i -g @bnbagent/studio-cli` (0.0.14) gives `bag`. `bag init <name> --network bsc-mainnet --destination self --protocols A2A,MCP,X402 --llm-provider anthropic --wallet-kind evm-local --no-onboard` scaffolds a seller; `bag wallet new --generate-password`; `bag doctor`; `bag dev --port 9000`. Verified: `/ping` → `HEALTHY`, agent card at `/.well-known/agent-card.json`, MCP at `/mcp`, x402 face → 503 "rail dormant" without merchant credentials. ERC-8004 registration needs about 0.02 BNB in the agent wallet. ERC-8183 commerce contract on mainnet `0xea4daa3100a767e86fded867729ae7446476eba6`, payment token U `0xcE24439F2D9C6a2289F741120FE202248B666666`. |
| Binance wagmi connector | `@binance/w3w-wagmi-connector` 1.2.3 peer-depends on viem ^1.19.3, so it does not install next to wagmi 3 / viem 2. The app uses wagmi's injected connector (EIP-6963). |
| Forking BSC locally | Public RPCs are not fit for an Anvil fork that executes a swap: `bsc-dataseed` prunes state within minutes ("missing trie node"), `bsc.drpc.org` rate-limits the fork's startup burst (HTTP 429), `bsc-mainnet.public.blastapi.io` serves old state but executed the swap too slowly for a 3-minute client timeout. `forge test --fork-url` works because it fetches state in one burst. |
| Anthropic | Claude Opus 5.5 reads a PTR PDF as a `document` block with `output_config.format` from `zodOutputFormat`; a 42-row filing came back fully structured on the first call. Streaming is required by the SDK for `max_tokens` above its non-streaming limit. |

## Keyless Binance endpoints (verified)

All under `https://www.binance.com/bapi/defi`, GET, JSON envelope `{code:"000000", data, success}`.

| Endpoint | Query | Returns |
|---|---|---|
| `/v1/public/wallet-direct/buw/wallet/market/token/rwa/stock/detail/list/ai` | `type=1` Ondo, `2` xStocks, `3` bStocks | rows `{chainId, contractAddress, symbol, ticker, type, assetType?, multiplier, d}`. Counts: type 1 → 1,366 rows (458 on BSC, 457 on Ethereum, 451 on Solana); type 2 → 269 (130 on BSC, 139 on Solana); type 3 → 91, all on BSC |
| `/v2/public/wallet-direct/buw/wallet/market/token/rwa/dynamic/ai` | `chainId=56&contractAddress=` | `tokenInfo{price, priceChangePct24h, sharesMultiplier, volume24h, bnTrader, bnHolder}`, `stockInfo{priceHigh52w, priceLow52w, marketCap, priceToEarnings, ...}`, `statusInfo{openState, reasonCode, nextOpenTime}` |
| `/v1/public/wallet-direct/buw/wallet/market/token/rwa/asset/market/status/ai` | `chainId&contractAddress` | `{openState, marketStatus, reasonCode, reasonMsg, nextOpenTime, nextCloseTime}` |
| `/v1/public/wallet-direct/buw/wallet/market/token/rwa/market/status/ai` | none | US session: `{marketStatus, openState, reasonCode, nextOpen, nextClose, offhours{openState, nextOpenTime, nextCloseTime}}` |
| `/v1/public/wallet-direct/buw/wallet/dex/market/token/kline/ai` | `chainId&contractAddress&interval=1d&limit=` | `{klineInfos:[[openTime, o, h, l, c, v, closeTime]...], decimals}` |

Sample on 2026-10-10 13:40 UTC (US market closed, weekend): NVDAB `price` 230.65, `sharesMultiplier`
1.000778, `reasonCode` TRADING (bStocks trade 24/5 on the AMM while `marketStatus` is `closed`),
`bnHolder` 10,288; market status `nextOpen` 2026-10-12T00:05:00Z.

## House Clerk and EDGAR

Unchanged from Coattails: the yearly index zip at `disclosures-clerk.house.gov/public_disc/financial-pdfs/2026FD.zip`,
PTR PDFs at `/public_disc/ptr-pdfs/2026/{DocID}.pdf`, EDGAR full-text search and the raw Form 4 XML with
a descriptive `User-Agent`. On 2026-10-10 the index had 358 PTRs the September database had not seen.
