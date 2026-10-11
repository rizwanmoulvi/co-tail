# Notes for the Developer Experience Report

The report itself is written by hand by Adil (the organisers reject AI-written reports). These are
the facts gathered during the build, with where each one happened, so the report can cite them.

## Onboarding

- The developer portal key is instant to create. The API is IP-gated on both the portal and the
  server; the prohibited list is published at `/en/dev-docs/web3-api-prohibited-regions`. A team in
  the US cannot even read the portal.
- The docs site is behind an AWS WAF challenge: `curl` gets an empty 202 for `llms-full.txt`. A
  browser or a fetcher that runs JavaScript gets it. The 451 KB `llms-full.txt` is the fastest way to
  learn the API once you can fetch it.
- The official SDK (`@binance-web3/wallet`) needs Node 22.12. It covers every REST endpoint with typed
  requests, which saved writing the HMAC signing by hand. `res.data()` returns the OCResult envelope;
  business errors come back as HTTP 200 with `code != 0`.

## Documentation issues, with locations

- RWA Data API page: field names in the doc are `tokenContractAddress`, `tokenSymbol`,
  `underlyingTicker`, `tokenToShareRatio`; the Skills documentation and the keyless endpoint use
  `contractAddress`, `symbol`, `ticker`, `multiplier`/`sharesMultiplier` for the same things. One
  vocabulary would help.
- RWA Data API: `platformId` enum lists `ondo` and `bstock` only; xStocks on BSC are absent from the
  signed list but present in the keyless list (`type=2`) and routable through the Trading API.
- Trading API `/swap` says `quoteId` on `order/submit` is `rfq.orderId`, but the `rfq` example has no
  `orderId` field.
- Transaction API simulate example shows `status: "SUCCESS"` next to a non-null `failReason`.
- Transaction API gas-limit example populates Tron-only fields on an EVM request.
- Agentic Wallet "Skills reference" page has no command syntax; the real reference is the
  `references/*.md` files in the skills hub repo.
- Agent Studio docs name `bag init --agent-only` nowhere, but `bag dev --agent-only` is in the
  product page's prose and is not a flag.
- `bag wallet new` run from `app/agent` wrote the keystore to the git root's `.studio/` instead of
  the workspace's `.studio/`, and `bag wallet show` then failed with "no studio.toml"; pass
  `--project-root` explicitly.

## API pitfalls

- Delegated execution: an aggregator SWAP route is calldata for `userWalletAddress` to send. A
  service that trades for users therefore needs a contract to be that wallet; the API has no
  "recipient" or "payer" parameter for the EVM path.
- Quote TTL is about 30 seconds, which is shorter than one Transaction API simulate plus a signing
  round trip on a busy node. Build the swap calldata and simulate in the same tick.
- RFQ routes (all Ondo, some bStocks) need an EIP-712 signature from the user wallet, so they are
  reachable only from a wallet the user controls (the Agentic Wallet path), not from a delegated
  executor.
- The Binance wagmi connector pins viem 1.x; it will not install in a 2026 wagmi 3 app.
- b402 verify/settle through the signed API needs merchant onboarding in the dev-portal project; the
  Agent Studio scaffold wants a different, manually approved set of OnchainPay credentials. Two
  merchant systems for one payment protocol.
- Public BSC RPCs cannot back an Anvil fork that executes a swap (state pruning, rate limits, slow
  state reads). The Foundry fork test is the working alternative.

## AI stack feedback

- The Agentic Wallet skill's command routing table and `--json` everywhere make it easy to drive from
  a script. Sign-in is a QR scan with a five-minute window and `auth verify` must block in the
  foreground, which does not fit a server that signs in once and runs for weeks; a long-lived
  session token or a service-account mode would.
- Agent Studio's split between fixed-code signing and LLM work is the right design, and the scaffold
  compiles and serves in minutes. `bag doctor` is the best onboarding tool in the whole stack. The
  48-hour managed trial is testnet only, so a mainnet agent runs on your own box.

## Tokenized-stock specifics

- Per-share price is token price divided by `sharesMultiplier`; the multiplier is on the same row as
  the token in the keyless list, which is simpler than Solana's Token-2022 scaled-UI extension.
- bStocks keep trading on the AMM while the US market is closed (`reasonCode: TRADING` next to
  `marketStatus: closed`), which is what makes a Friday-night filing copyable on Friday night.
- NVDAB/USDT on PancakeSwap V3 holds $3.5M at the 0.25% tier; a $10 swap moved the price 0.06% on a
  mainnet fork.

## Requested capabilities

- A `recipient` (and ideally `payer`) parameter on EVM SWAP routes so non-custodial services can
  route output to the user without a contract.
- The RWA list under one vocabulary across the signed API, the keyless API and the skills.
- xStocks in the signed RWA token list for BSC.
- A service sign-in for the Agentic Wallet.
- One merchant onboarding for b402 that both the Web3 API and Agent Studio accept.
