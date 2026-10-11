import { AppShell } from "@/components/app-shell"
import { session } from "@/server/prices"

export const dynamic = "force-dynamic"

export default async function AppLayout({ children }: LayoutProps<"/app">) {
  const s = await session().catch(() => null)
  const label = s ? (s.openState ? "Market open" : s.marketStatus === "closed" ? (s.reasonMsg?.includes("Weekend") ? "Weekend" : "Market closed") : s.marketStatus) : null
  return <AppShell session={s && label ? { open: s.openState, label } : null}>{children}</AppShell>
}
