import { NextResponse } from "next/server"
import { cronAllowed, cronRefused } from "@/server/cron"
import { tradeTick } from "@/server/pipeline"

/** The fast loop as an HTTP job: receipts, mirrors, exits. Hit it every minute (20 s on the VPS worker). */
export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function GET(req: Request) {
  if (!cronAllowed(req)) return cronRefused()
  const summary = await tradeTick()
  return NextResponse.json({ ok: true, summary })
}
