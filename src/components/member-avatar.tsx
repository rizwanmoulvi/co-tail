import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import type { SourceView } from "@/server/queries"

function initials(name: string) {
  const parts = name.split(/\s+/).filter((p) => /^[A-Z]/.test(p))
  return (parts[0]?.[0] ?? "") + (parts.at(-1)?.[0] ?? "")
}

/** A round portrait on raised paper, with a serif initial when there is no photo. */
export function MemberAvatar({ source, className }: { source: SourceView; className?: string }) {
  return (
    <Avatar className={cn("size-11 rounded-full bg-paper-2 shadow-[inset_0_0_0_1.5px_var(--line)]", className)}>
      {source.photoUrl && <AvatarImage src={source.photoUrl} alt="" className="rounded-full object-cover object-top" />}
      <AvatarFallback className="rounded-full bg-transparent font-heading text-base font-semibold text-ink">{initials(source.name)}</AvatarFallback>
    </Avatar>
  )
}

const PARTY: Record<string, string> = { D: "Democrat", R: "Republican", I: "Independent" }

export function PartySeat({ source }: { source: SourceView }) {
  if (source.kind === "insider") {
    return (
      <span className="inline-flex min-w-0 items-center gap-1.5 text-sm text-ink-soft">
        <span className="font-mono text-[0.78rem] text-ink">{source.seat}</span>
        <span className="truncate">{source.affiliation}</span>
      </span>
    )
  }
  const seat = source.seat ? `${source.seat.slice(0, 2)}-${Number(source.seat.slice(2)) || "AL"}` : null
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-ink-soft">
      {source.affiliation && <span>{PARTY[source.affiliation] ?? source.affiliation}</span>}
      {seat && <span className="font-mono text-[0.78rem]">{seat}</span>}
    </span>
  )
}
