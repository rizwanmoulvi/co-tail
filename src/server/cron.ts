import { NextResponse } from "next/server"

/**
 * Guards the cron routes. Vercel sends `Authorization: Bearer <CRON_SECRET>` on scheduled calls;
 * an external pinger sends the same header. Without CRON_SECRET set, the routes refuse.
 */
export function cronAllowed(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const auth = req.headers.get("authorization") ?? ""
  return auth === `Bearer ${secret}` || new URL(req.url).searchParams.get("secret") === secret
}

export function cronRefused() {
  return NextResponse.json({ error: "CRON_SECRET missing or wrong" }, { status: 401 })
}
