"use client"

import { toast } from "sonner"
import { useAccount, useConnect, useConnectors, useDisconnect } from "wagmi"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { explorerAddress } from "@/lib/chain"
import { shortAddress } from "@/lib/format"

/** The wallet pill in the header, as ProX draws its session pill: address, then an action. */
export function WalletButton() {
  const { address, connector, isConnecting, isReconnecting } = useAccount()
  const connectors = useConnectors()
  const { connect, isPending } = useConnect()
  const { disconnect } = useDisconnect()

  if (address) {
    return (
      <span className="flex items-center rounded-full shadow-[inset_0_0_0_1.5px_var(--line)]">
        <span className="py-1.5 pr-2 pl-3.5 font-mono text-[0.78rem] text-ink-soft" title={`${address} via ${connector?.name ?? "wallet"}`}>
          {shortAddress(address)}
        </span>
        <DropdownMenu>
          <DropdownMenuTrigger className="cursor-pointer rounded-full py-1.5 pr-3.5 pl-2 text-[0.8rem] font-bold text-ink-soft transition-colors duration-150 hover:text-ink">
            Wallet
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 rounded-lg bg-paper-2 shadow-[inset_0_0_0_1.5px_var(--line)]">
            <DropdownMenuLabel className="font-normal text-ink-faint">{connector?.name ?? "Wallet"} on BNB Chain</DropdownMenuLabel>
            <DropdownMenuGroup>
              <DropdownMenuItem
                onSelect={() => {
                  navigator.clipboard.writeText(address)
                  toast("Address copied")
                }}
              >
                Copy address
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => window.open(explorerAddress(address))}>View on BscScan</DropdownMenuItem>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => disconnect()}>Disconnect</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </span>
    )
  }

  const busy = isConnecting || isReconnecting || isPending

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={busy}
        className="cursor-pointer rounded-full bg-ink px-4 py-2 text-sm font-bold text-paper transition-[scale,background-color] duration-150 ease-out-strong hover:bg-[#2c281b] active:scale-[0.97] disabled:opacity-50"
      >
        {busy ? "Connecting" : "Connect wallet"}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 rounded-lg bg-paper-2 shadow-[inset_0_0_0_1.5px_var(--line)]">
        <DropdownMenuLabel className="font-normal text-ink-faint">BNB Smart Chain</DropdownMenuLabel>
        <DropdownMenuGroup>
          {connectors.map((c) => (
            <DropdownMenuItem key={c.uid} onSelect={() => connect({ connector: c })}>
              {c.icon ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.icon} alt="" width={16} height={16} className="size-4" />
              ) : null}
              {c.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
