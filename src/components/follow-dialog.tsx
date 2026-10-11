"use client"

import { CheckCircle } from "@phosphor-icons/react"
import Link from "next/link"
import { useState } from "react"
import { useAccount } from "wagmi"
import { MemberAvatar, PartySeat } from "@/components/member-avatar"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldSeparator } from "@/components/ui/field"
import { Spinner } from "@/components/ui/spinner"
import { usd } from "@/lib/format"
import { useMe } from "@/lib/queries"
import { useFollowPrefs } from "@/lib/store"
import { useWalletCalls } from "@/lib/wallet-tx"
import type { SourceView } from "@/server/queries"

const PER_TRADE = [5, 10, 25, 50]
const BUDGET = [25, 50, 100, 250]
const STOPS: (number | null)[] = [0.1, 0.15, 0.25, null]
const HOLDS: (number | null)[] = [30, 90, 180, null]

/** A row of keys over a fixed set of values, where null is the "Off" option. ProX's protection-level keys. */
function Choice<T extends number | null>({
  id,
  value,
  options,
  onChange,
  format,
}: {
  id: string
  value: T
  options: T[]
  onChange: (v: T) => void
  format: (v: T) => string
}) {
  return (
    <div id={id} role="group" className="grid gap-2" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => (
        <button
          key={o === null ? "off" : String(o)}
          type="button"
          aria-pressed={value === o}
          onClick={() => onChange(o)}
          className={`cursor-pointer rounded-lg py-2.5 text-sm font-bold transition-[scale,background-color,color,box-shadow] duration-150 ease-out-strong active:scale-[0.97] ${
            value === o ? "bg-ink text-paper" : "shadow-[inset_0_0_0_1.5px_var(--line)] hover:shadow-[inset_0_0_0_1.5px_var(--ink)]"
          }`}
        >
          {format(o)}
        </button>
      ))}
    </div>
  )
}

export function FollowButton({ source, size = "sm", label }: { source: SourceView; size?: "sm" | "default" | "lg"; label?: string }) {
  const [open, setOpen] = useState(false)
  const { address: wallet } = useAccount()
  const me = useMe(wallet)
  const prefs = useFollowPrefs()
  const following = me.data?.follows.some((f) => f.source.slug === source.slug && f.active)

  const follow = useWalletCalls({
    buildPath: "/api/follow/build",
    buildBody: () => ({ slug: source.slug, perTradeUsd: prefs.perTradeUsd, budgetUsd: prefs.budgetUsd, dailyCapUsd: Math.min(prefs.budgetUsd, prefs.perTradeUsd * 5) }),
    intent: { type: "follow", slug: source.slug, perTradeUsd: prefs.perTradeUsd, trailingStopPct: prefs.trailingStopPct, maxHoldDays: prefs.maxHoldDays },
    done: `Mirroring ${source.name}`,
  })

  const balance = me.data?.cash.balance ?? 0
  const needsFunds = !!wallet && me.isSuccess && balance < prefs.perTradeUsd

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (!v && follow.isSuccess) follow.reset()
      }}
    >
      <DialogTrigger asChild>
        <Button size={size} variant={following ? "outline" : "default"} className="rounded-full">
          {following && <CheckCircle weight="fill" data-icon="inline-start" className="text-buy" />}
          {following ? "Mirroring" : (label ?? "Mirror")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto overscroll-contain rounded-lg bg-paper-2 shadow-[inset_0_0_0_1.5px_var(--line)] sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <MemberAvatar source={source} className="size-12" />
            <div className="grid gap-0.5">
              <DialogTitle className="font-heading text-[1.45rem] font-semibold tracking-[-0.3px]">Mirror {source.name}</DialogTitle>
              <PartySeat source={source} />
            </div>
          </div>
          <DialogDescription className="pt-2 text-sm leading-relaxed">
            When a new report shows a purchase of a tokenized stock, Tailcoat buys the bStock for you with USDT from your
            wallet, through its contract on BNB Chain. Your exit rules decide when it sells.
          </DialogDescription>
        </DialogHeader>

        <FieldGroup className="gap-5">
          <Field>
            <FieldLabel htmlFor="per-trade">Per trade</FieldLabel>
            <Choice id="per-trade" value={prefs.perTradeUsd} options={PER_TRADE} onChange={prefs.setPerTrade} format={(v) => `$${v}`} />
            <FieldDescription>Set on-chain as your per-trade cap. The contract refuses anything larger.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="budget">Budget</FieldLabel>
            <Choice
              id="budget"
              value={prefs.budgetUsd}
              options={BUDGET.filter((b) => b >= prefs.perTradeUsd)}
              onChange={prefs.setBudget}
              format={(v) => `$${v}`}
            />
            <FieldDescription>The USDT approval you give the Tailcoat contract. It can never spend more.</FieldDescription>
          </Field>
          <FieldSeparator />
          <Field>
            <FieldLabel htmlFor="trailing-stop">Trailing stop</FieldLabel>
            <Choice
              id="trailing-stop"
              value={prefs.trailingStopPct}
              options={STOPS}
              onChange={prefs.setTrailingStop}
              format={(v) => (v === null ? "Off" : `${Math.round(v * 100)}%`)}
            />
            <FieldDescription>Sell if the price falls this far below its highest point since you bought.</FieldDescription>
          </Field>
          <Field>
            <FieldLabel htmlFor="max-hold">Time limit</FieldLabel>
            <Choice
              id="max-hold"
              value={prefs.maxHoldDays}
              options={HOLDS}
              onChange={prefs.setMaxHold}
              format={(v) => (v === null ? "Off" : `${v}d`)}
            />
            <FieldDescription>Sell after this many days if no sale has been reported.</FieldDescription>
          </Field>
        </FieldGroup>

        <p className="border-l-2 border-gold pl-3 text-sm leading-relaxed text-ink-soft">
          Two transactions from your wallet: a USDT approval for your budget, and your caps on the Tailcoat contract.
          Bought stock lands in your wallet in the same transaction that spends the USDT. Tailcoat pays the gas for every
          mirror, and you can revoke or pause at any time.
        </p>

        <DialogFooter className="gap-2 sm:justify-between">
          {!wallet ? (
            <p className="self-center text-sm text-muted-foreground">Connect a wallet from the top bar to continue.</p>
          ) : (
            <Link href="/app/portfolio" className="self-center text-xs text-muted-foreground hover:text-foreground">
              Wallet: {usd(balance)} USDT{needsFunds ? ", top up first" : ""}
            </Link>
          )}
          <Button className="rounded-full" onClick={() => follow.mutate()} disabled={!wallet || follow.isPending || needsFunds}>
            {follow.isPending && <Spinner data-icon="inline-start" />}
            {follow.isPending ? "Waiting for your wallet…" : `Approve ${usd(prefs.budgetUsd, 0)} and mirror`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
