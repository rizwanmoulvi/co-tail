# Before and after: Coattails on Solana to Tailcoat on BNB Chain

Tailcoat enters the hackathon under the "existing product, new integration" clause. The product is
Coattails (built 2026-09-24 for the Stocklana hackathon, public at coattails.adilhusain.xyz and
github.com/adilhusain01/Coattails). This is what changed, piece by piece, and what the Binance stack
did better or worse than the Solana stack it replaced. Everything here was measured on the VPS in
Mumbai on 2026-10-10 unless marked otherwise.

| Piece | Before (Solana, September) | After (BNB Chain, October) |
|---|---|---|
| Tokenized stocks | xStocks on Solana: 1,124 Token-2022 mints from the xStocks API, 950 US listings | bStocks first, xStocks on BSC second, Ondo shown: 91 + 130 + 458 BEP-20 tokens from Binance's public lists, 221 executable |
| Where the list comes from | xstocks.fi public API (rate limited, Cloudflare blocks default UAs) | Binance's keyless `rwa/stock/detail/list/ai` endpoint, the one its own Wallet Skills read; RWA Data API when a key is set |
| Per-share price | Pyth Hermes (needs a key since 2026-08-26) with Jupiter and Yahoo fallbacks | bStock token price divided by `sharesMultiplier` from Binance's keyless dynamic endpoint, plus asset status and the next open time. No key, no fallback needed |
| Custody | SPL `approve` on the follower's USDC with the agent as delegate; the agent builds a Jupiter swap with `destinationTokenAccount` = follower | A contract, `TailcoatMirror`: USDT approval plus on-chain caps; the operator can only swap into allowlisted stocks through allowlisted routers, output to the follower in the same transaction |
| Why the change | On Solana one atomic transaction could pull the delegated USDC and route the swap output to the follower, so no program was needed | On BSC an aggregator route must be sent from the wallet that holds the tokens, and a delegated key cannot send a transaction as the follower. The contract is the follower's "wallet" for the swap and enforces the caps the SPL delegate could not (per trade and per day) |
| Route | Jupiter Swap V2 `/build` (Metis only), 0.5 RPS keyless | Binance Trading API quote and swap calldata built with the contract as the wallet (bStocks: LiquidMesh SWAP route); PancakeSwap V3 `exactInputSingle` as the fallback, chosen by on-chain quote across fee tiers |
| Pre-flight | Solana `simulateTransaction` through the RPC | Binance Transaction API `simulate` before every broadcast, RPC `eth_call` as the fallback, and the execution record says which one vouched |
| Broadcast | RPC `sendTransaction` | Binance Transaction API `broadcast-transaction` with MEV protection, RPC as the fallback |
| Receipts | A Memo transaction with the filing's sha256 | A `Receipt` event on the contract with the sha256 as an indexed topic |
| Fees | Agent pays about 0.000005 SOL per transaction | Operator pays about 0.0002 BNB per mirror at 1 gwei (fork measurement: 1.64M gas for a V3 swap through the contract) |
| The reader | GPT-6 Luna through OpenRouter, Gemini fallback, Sarvam fallback | Claude Opus 5.5 through the Anthropic SDK with structured output, OpenRouter and Sarvam kept as fallbacks |
| Agent economics | COAT, a token on Clawpump with a Meteora pool | An ERC-8004 agent built with BNB Agent Studio that sells each parsed filing per call (x402 and ERC-8183) |
| Anyone's own agent | None | A Binance Wallet Skill that runs the strategy from an Agentic Wallet with the wallet signing each buy |
| Demo | Four scenarios on devnet with stand-in mints | Mainnet only, with small real amounts; the fork test replaces devnet for the contract |

## What was easier on BNB Chain

- The stock list and prices needed no key at all, which is the opposite of Solana in September, where
  Pyth started refusing keyless calls two weeks before the build.
- The share multiplier is on the same row as the token, so per-share price is one division. On Solana
  the multiplier lived in the Token-2022 extension with an effective timestamp to compare.
- The market status endpoint says when the asset reopens, so the worker can leave a mirror pending
  with a reason instead of retrying blindly.
- A single public RPC serves everything the executor needs; no `maxAccounts` juggling, no lookup
  tables, no compute budget guessing.

## What was harder

- A delegated swap needs a contract. That is more code to audit (the contract is 180 lines with
  OpenZeppelin), but the caps it enforces are better than what an SPL delegate could express.
- Forking BSC for a full end-to-end run was not possible on public RPCs: the dataseed nodes prune
  state within minutes, dRPC's free tier rate-limits a fork's burst of calls, and Blast's node was too
  slow to execute a swap before the client timed out. The Foundry fork test worked because it fetches
  everything in one burst at the fork block. A local end-to-end run on a fork needs a paid archive RPC.
- Binance's wagmi connector (`@binance/w3w-wagmi-connector` 1.2.3) pins viem 1.x and cannot be
  installed next to wagmi 3. The app uses wagmi's injected connector with EIP-6963 discovery instead,
  which the Binance Web3 Wallet extension supports.
- The Agent Studio x402 face needs B402 merchant credentials that are approved by hand, separately
  from the Web3 API key. Until they arrive the face is dormant and the ERC-8183 rail carries the
  sales.
