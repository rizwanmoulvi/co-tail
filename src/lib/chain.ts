/** BSC mainnet facts the client needs. Addresses come from the server's env at build time. */
export const CHAIN_ID = 56
export const USDT = "0x55d398326f99059fF775485246999027B3197955" as const
export const MIRROR = (process.env.NEXT_PUBLIC_MIRROR_ADDRESS || "") as `0x${string}` | ""
export const RPC_URL = process.env.NEXT_PUBLIC_BSC_RPC_URL || "https://bsc-dataseed.binance.org"

export function explorerTx(hash: string) {
  return `https://bscscan.com/tx/${hash}`
}

export function explorerAddress(address: string) {
  return `https://bscscan.com/address/${address}`
}

export function explorerToken(address: string) {
  return `https://bscscan.com/token/${address}`
}
