import { NextResponse } from "next/server"
import { cronAllowed, cronRefused } from "@/server/cron"
import { ingestTick } from "@/server/pipeline"

/** The slow loop as an HTTP job: new filings and model reads. Hit it every minute. */
export const dynamic = "force-dynamic"
export const maxDuration = 300

export async function GET(req: Request) {
  if (!cronAllowed(req)) return cronRefused()
  const summary = await ingestTick()
  return NextResponse.json({ ok: true, summary })
}
