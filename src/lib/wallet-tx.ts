"use client"

import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { useAccount, useConfig } from "wagmi"
import { sendTransaction, switchChain, waitForTransactionReceipt } from "wagmi/actions"
import { CHAIN_ID, explorerTx } from "@/lib/chain"
import { keys } from "@/lib/queries"

export class ApiError extends Error {}

export async function api<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const data = (await res.json().catch(() => ({}))) as T & { error?: string }
  if (!res.ok) throw new ApiError(data.error ?? `Request failed (${res.status})`)
  return data
}

export type Call = { to: `0x${string}`; data: `0x${string}`; symbol?: string }

export function userRejected(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err)
  return /reject|denied|cancel/i.test(msg)
}

/**
 * The follower's wallet sends each call the server built (approve, set caps, allow selling), one
 * after the other, then the server records what happened against the last transaction hash.
 */
export function useWalletCalls(opts: { buildPath: string; intent: Record<string, unknown>; done: string; buildBody?: () => Record<string, unknown> }) {
  const config = useConfig()
  const { address, chainId } = useAccount()
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      if (!address) throw new Error("Connect a wallet first")
      if (chainId !== CHAIN_ID) await switchChain(config, { chainId: CHAIN_ID })
      const { calls } = await api<{ calls: Call[] | Record<string, Call> }>(opts.buildPath, { wallet: address, ...(opts.buildBody?.() ?? {}) })
      const list = Array.isArray(calls) ? calls : Object.values(calls)
      let last: `0x${string}` | null = null
      for (const call of list) {
        const hash = await sendTransaction(config, { to: call.to, data: call.data, chainId: CHAIN_ID })
        const receipt = await waitForTransactionReceipt(config, { hash, chainId: CHAIN_ID })
        if (receipt.status !== "success") throw new Error(`Transaction reverted: ${hash}`)
        last = hash
      }
      if (!last) throw new Error("Nothing to sign")
      await api("/api/follow/submit", { wallet: address, txHash: last, intent: opts.intent })
      return last
    },
    onSuccess: (hash) => {
      toast.success(opts.done, { action: { label: "View", onClick: () => window.open(explorerTx(hash)) } })
      queryClient.invalidateQueries({ queryKey: keys.me(address ?? "") })
      queryClient.invalidateQueries({ queryKey: keys.leaders })
    },
    onError: (e: Error) => (userRejected(e) ? toast("Cancelled in your wallet") : toast.error(e.message)),
  })
}
