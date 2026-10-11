import { NextResponse } from "next/server"
import { cronAllowed, cronRefused } from "@/server/cron"
import { registryTick } from "@/server/pipeline"

/** Refreshes the tokenized-stock registry. Hourly. */
export const dynamic = "force-dynamic"
export const maxDuration = 60

export async function GET(req: Request) {
  if (!cronAllowed(req)) return cronRefused()
  const summary = await registryTick()
  return NextResponse.json({ ok: true, summary })
}
