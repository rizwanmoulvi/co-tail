"use client"

import { createConfig, http } from "wagmi"
import { bsc } from "wagmi/chains"
import { injected } from "wagmi/connectors"
import { RPC_URL } from "@/lib/chain"

/**
 * BNB Smart Chain only. Injected wallets are discovered through EIP-6963, which is how the
 * Binance Web3 Wallet extension, MetaMask, Rabby and the Binance app's in-app browser announce
 * themselves. (Binance's own wagmi connector package pins viem 1.x and does not load next to
 * wagmi 3, which is noted in the developer experience report.)
 */
export const wagmiConfig = createConfig({
  chains: [bsc],
  connectors: [injected()],
  transports: { [bsc.id]: http(RPC_URL) },
  ssr: true,
})

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig
  }
}
